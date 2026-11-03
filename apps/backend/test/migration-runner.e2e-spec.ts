import { QueryTypes, type Sequelize, type Transaction } from 'sequelize'
import { inject } from 'vitest'
import { createUmzug, MIGRATION_LOCK_KEY, runInMigrationTransaction } from '../src/factories/umzug.factory.js'
import { createConnection, listMigrationFiles } from './support/migrations.js'

async function migrationNames(): Promise<string[]> {
    return (await listMigrationFiles()).map((file) => file.replace(/\.ts$/, ''))
}

async function executedNames(sequelize: Sequelize): Promise<string[]> {
    return (await createUmzug(sequelize).executed()).map((migration) => migration.name)
}

async function columnUdtName(sequelize: Sequelize, table: string, column: string): Promise<string | undefined> {
    const rows = await sequelize.query<{ udtName: string }>(
        `SELECT udt_name AS "udtName" FROM information_schema.columns
         WHERE table_name = :table AND column_name = :column`,
        { type: QueryTypes.SELECT, replacements: { table, column } },
    )
    return rows[0]?.udtName
}

async function backendPid(sequelize: Sequelize, options: { transaction?: Transaction } = {}): Promise<number> {
    const rows = await sequelize.query<{ pid: number }>('SELECT pg_backend_pid() AS "pid"', {
        ...options,
        type: QueryTypes.SELECT,
    })
    return rows[0]!.pid
}

describe('migration runner', () => {
    const env = inject('e2eEnv')
    const database = 'migration_runner'
    let admin: Sequelize
    let sequelize: Sequelize

    beforeAll(async () => {
        admin = createConnection(env)
        await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin.query(`CREATE DATABASE "${database}"`)
        sequelize = createConnection(env, database)
        await createUmzug(sequelize).up()
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('records every migration once, by name without extension', async () => {
        const executed = (await createUmzug(sequelize).executed()).map((migration) => migration.name)
        const expected = (await listMigrationFiles()).map((file) => file.replace(/\.ts$/, ''))

        expect(executed).toEqual(expected)
        for (const name of executed) {
            expect(name).not.toMatch(/\.(ts|js)$/)
        }
    })

    it('has nothing pending after up', async () => {
        expect(await createUmzug(sequelize).pending()).toEqual([])
    })
})

describe('migration runner locking', () => {
    const env = inject('e2eEnv')
    const databases: string[] = []
    const connections: Sequelize[] = []
    let admin: Sequelize

    async function createFreshDatabase(name: string): Promise<void> {
        databases.push(name)
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
        await admin.query(`CREATE DATABASE "${name}"`)
    }

    function connect(database: string): Sequelize {
        const connection = createConnection(env, database)
        connections.push(connection)
        return connection
    }

    async function tryLock(sequelize: Sequelize): Promise<boolean> {
        const rows = await sequelize.query<{ acquired: boolean }>(
            `SELECT pg_try_advisory_lock(${MIGRATION_LOCK_KEY}) AS "acquired"`,
            { type: QueryTypes.SELECT },
        )
        return rows[0]?.acquired ?? false
    }

    beforeAll(() => {
        admin = createConnection(env)
    })

    afterAll(async () => {
        await Promise.allSettled(connections.map((connection) => connection.close()))
        for (const name of databases) {
            await admin?.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
        }
        await admin?.close()
    })

    it('applies each migration exactly once when two runners start together', async () => {
        const database = 'migration_runner_concurrent'
        await createFreshDatabase(database)
        const first = createUmzug(connect(database))
        const second = createUmzug(connect(database))

        const [firstApplied, secondApplied] = await Promise.all([first.up(), second.up()])

        const [duplicates] = await connect(database).query(
            'SELECT name, count(*) FROM "SequelizeMeta" GROUP BY name HAVING count(*) > 1',
        )
        const expected = (await listMigrationFiles()).map((file) => file.replace(/\.ts$/, ''))
        const applied = [...firstApplied, ...secondApplied].map((migration) => migration.name)
        expect(duplicates).toEqual([])
        expect(applied.sort()).toEqual(expected)
    })

    it('releases the lock when the holding connection closes', async () => {
        const database = 'migration_runner_crashed_holder'
        await createFreshDatabase(database)
        const holder = connect(database)
        await holder.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`)
        await holder.close()

        const applied = await createUmzug(connect(database)).up()

        expect(applied.length).toBeGreaterThan(0)
    })

    it('releases the lock when the command fails', async () => {
        const database = 'migration_runner_failed_command'
        await createFreshDatabase(database)
        const runner = createUmzug(connect(database))

        await expect(runner.up({ migrations: ['no-such-migration'] })).rejects.toThrow()

        expect(await tryLock(connect(database))).toBe(true)
    })
})

describe('migration runner transactions', () => {
    const env = inject('e2eEnv')
    const databases: string[] = []
    const connections: Sequelize[] = []
    let admin: Sequelize

    async function connectToFreshDatabase(name: string): Promise<Sequelize> {
        databases.push(name)
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
        await admin.query(`CREATE DATABASE "${name}"`)
        const connection = createConnection(env, name)
        connections.push(connection)
        return connection
    }

    beforeAll(() => {
        admin = createConnection(env)
    })

    afterAll(async () => {
        await Promise.allSettled(connections.map((connection) => connection.close()))
        for (const name of databases) {
            await admin?.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
        }
        await admin?.close()
    })

    it('rolls back every migration of an up run when one of them fails', async () => {
        const sequelize = await connectToFreshDatabase('migration_runner_failed_up')
        const names = await migrationNames()
        const lastApplied = '015-create-api-keys-and-mail-messages'
        await createUmzug(sequelize).up({ to: lastApplied })
        await sequelize.query('ALTER TABLE "inbound_form" ADD COLUMN "allowedHostnames" TEXT[]')

        await expect(createUmzug(sequelize).up()).rejects.toThrow('Migration 017-harden-inbound-forms (up) failed')

        expect(await executedNames(sequelize)).toEqual(names.slice(0, names.indexOf(lastApplied) + 1))
        expect(await columnUdtName(sequelize, 'roles', 'scope')).toBeUndefined()
    })

    it('rolls back every migration of a down run when one of them fails', async () => {
        const sequelize = await connectToFreshDatabase('migration_runner_failed_down')
        await createUmzug(sequelize).up()
        await sequelize.query('ALTER TABLE "roles" DROP COLUMN "description"')

        await expect(createUmzug(sequelize).down({ to: '016-add-role-scopes-and-project-roles' })).rejects.toThrow(
            'Migration 016-add-role-scopes-and-project-roles (down) failed',
        )

        expect(await executedNames(sequelize)).toEqual(await migrationNames())
        expect(await columnUdtName(sequelize, 'inbound_form', 'allowedHostnames')).toBe('_varchar')
    })

    it('refuses a migration that opens a transaction of its own', async () => {
        const sequelize = await connectToFreshDatabase('migration_runner_nested_transaction')

        await expect(
            runInMigrationTransaction(sequelize, () => sequelize.transaction(() => Promise.resolve())),
        ).rejects.toThrow('Migrations run inside the transaction of the migration runner')
    })

    it('leaves transactions outside a migration run explicit', async () => {
        const sequelize = await connectToFreshDatabase('migration_runner_outside_transaction')

        await sequelize.transaction(async (transaction) => {
            expect(await backendPid(sequelize)).not.toBe(await backendPid(sequelize, { transaction }))
        })
    })
})
