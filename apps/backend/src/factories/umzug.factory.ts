import { AsyncLocalStorage } from 'node:async_hooks'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Logger } from '@nestjs/common'
import { Sequelize, type QueryInterface, type Transaction } from 'sequelize'
import { SequelizeStorage, Umzug, type MigrateDownOptions, type MigrateUpOptions, type UmzugOptions } from 'umzug'

export const MIGRATION_LOCK_KEY = 815_003

const runTransaction = new AsyncLocalStorage<Transaction>()

// Sequelize v6 only passes a transaction to queries that don't name one through a
// process-wide CLS namespace. This one answers only inside a migration run, so every
// other transaction in the process stays explicit.
Sequelize.useCLS({
    get: (key: string) => (key === 'transaction' ? runTransaction.getStore() : undefined),
    set: () => undefined,
    bind: <T>(callback: T) => callback,
    run(callback: (context: object) => unknown) {
        if (runTransaction.getStore()) {
            throw new Error(
                'Migrations run inside the transaction of the migration runner and must not open one of their own',
            )
        }
        callback({})
    },
})

export function runInMigrationTransaction<T>(sequelize: Sequelize, command: () => Promise<T>): Promise<T> {
    return sequelize.transaction((transaction) =>
        runTransaction.run(transaction, async () => {
            await sequelize.query('SELECT pg_advisory_xact_lock(:key)', { replacements: { key: MIGRATION_LOCK_KEY } })
            return command()
        }),
    )
}

class TransactionalUmzug extends Umzug<QueryInterface> {
    constructor(
        private readonly sequelize: Sequelize,
        options: UmzugOptions<QueryInterface>,
    ) {
        super(options)
    }

    override up(options?: MigrateUpOptions) {
        return runInMigrationTransaction(this.sequelize, () => super.up(options))
    }

    override down(options?: MigrateDownOptions) {
        return runInMigrationTransaction(this.sequelize, () => super.down(options))
    }
}

function describeMigrationEvent(event: Record<string, unknown>): string {
    const parts = [event.event, event.name ?? event.path ?? event.message].filter((part) => typeof part === 'string')
    const duration = typeof event.durationSeconds === 'number' ? ` (${event.durationSeconds}s)` : ''
    return `${parts.join(' ')}${duration}`
}

export function createMigrationLogger(): UmzugOptions['logger'] {
    const logger = new Logger('Migrations')
    return {
        info: (event) => logger.log(describeMigrationEvent(event)),
        warn: (event) => logger.warn(describeMigrationEvent(event)),
        error: (event) => logger.error(describeMigrationEvent(event)),
        debug: (event) => logger.debug(describeMigrationEvent(event)),
    }
}

const sourceExtension = extname(import.meta.filename)
const sourceRoot = join(import.meta.dirname, '..')

export function createUmzug(sequelize: Sequelize): Umzug<QueryInterface> {
    return new TransactionalUmzug(sequelize, {
        migrations: {
            glob: [`migrations/*${sourceExtension}`, { cwd: sourceRoot }],
            // umzug's default loader rejects .ts files outright, so each migration is
            // imported here, whether it runs from source (tsx, Vitest) or compiled dist.
            resolve({ name, path, context }) {
                const loadMigration = () =>
                    import(pathToFileURL(path!).href) as Promise<{
                        up: (params: { context: QueryInterface }) => Promise<unknown>
                        down: (params: { context: QueryInterface }) => Promise<unknown>
                    }>
                return {
                    name: basename(name, extname(name)),
                    up: async () => (await loadMigration()).up({ context }),
                    down: async () => (await loadMigration()).down({ context }),
                }
            },
        },
        context: sequelize.getQueryInterface(),
        storage: new SequelizeStorage({ sequelize }),
        logger: createMigrationLogger(),
        create: {
            folder: join(sourceRoot, 'migrations'),
        },
    })
}
