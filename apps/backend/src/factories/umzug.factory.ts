import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { QueryInterface, Sequelize } from 'sequelize'
import { SequelizeStorage, Umzug } from 'umzug'

export const MIGRATION_LOCK_KEY = 815_003

interface QueryableConnection {
    query(sql: string, values: unknown[]): Promise<unknown>
}

function isQueryableConnection(connection: object): connection is QueryableConnection {
    return 'query' in connection && typeof connection.query === 'function'
}

const sourceExtension = extname(import.meta.filename)
const sourceRoot = join(import.meta.dirname, '..')

export function createUmzug(sequelize: Sequelize): Umzug<QueryInterface> {
    let lockConnection: QueryableConnection | null = null

    const acquireLock = async () => {
        const connection = await sequelize.connectionManager.getConnection({ type: 'write' })
        try {
            if (!isQueryableConnection(connection)) {
                throw new Error('The database connection does not support raw queries')
            }
            await connection.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
            lockConnection = connection
        } catch (error) {
            sequelize.connectionManager.releaseConnection(connection)
            throw error
        }
    }

    const releaseLock = async () => {
        const connection = lockConnection
        lockConnection = null
        if (!connection) {
            return
        }
        try {
            await connection.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
        } finally {
            sequelize.connectionManager.releaseConnection(connection)
        }
    }

    const umzug = new Umzug({
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
        logger: console,
        create: {
            folder: join(sourceRoot, 'migrations'),
        },
    })

    umzug.on('beforeCommand', acquireLock)
    umzug.on('afterCommand', releaseLock)

    return umzug
}
