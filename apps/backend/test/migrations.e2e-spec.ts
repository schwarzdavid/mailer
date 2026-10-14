import { QueryTypes, type Sequelize } from 'sequelize'
import { inject } from 'vitest'
import { createConnection, listMigrationFiles, loadMigrations, type Migration } from './support/migrations.js'

interface SchemaSnapshot {
    columns: string[]
    indexes: string[]
    constraints: string[]
    enums: string[]
    sequences: string[]
}

async function selectLines(sequelize: Sequelize, sql: string): Promise<string[]> {
    const rows = await sequelize.query<{ line: string }>(sql, { type: QueryTypes.SELECT })
    return rows.map((row) => row.line)
}

async function snapshotSchema(sequelize: Sequelize): Promise<SchemaSnapshot> {
    return {
        columns: await selectLines(
            sequelize,
            `SELECT concat_ws(' ', table_name || '.' || column_name, data_type, character_maximum_length,
                    CASE WHEN is_nullable = 'NO' THEN 'NOT NULL' END, 'DEFAULT ' || column_default) AS line
             FROM information_schema.columns WHERE table_schema = 'public' ORDER BY line`,
        ),
        indexes: await selectLines(
            sequelize,
            `SELECT indexdef AS line FROM pg_indexes WHERE schemaname = 'public' ORDER BY line`,
        ),
        constraints: await selectLines(
            sequelize,
            `SELECT conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid) AS line
             FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY line`,
        ),
        enums: await selectLines(
            sequelize,
            `SELECT t.typname || ' (' || string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) || ')' AS line
             FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
             WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname ORDER BY line`,
        ),
        sequences: await selectLines(
            sequelize,
            `SELECT sequence_name AS line FROM information_schema.sequences
             WHERE sequence_schema = 'public' ORDER BY line`,
        ),
    }
}

describe('migration files', () => {
    it('are numbered sequentially from 001 without gaps or duplicates', async () => {
        const files = await listMigrationFiles()

        expect(files.length).toBeGreaterThan(0)
        for (const file of files) {
            expect(file, `${file} must be named NNN-kebab-case.ts`).toMatch(/^\d{3}-[a-z0-9]+(-[a-z0-9]+)*\.ts$/)
        }
        const numbers = files.map((file) => Number(file.slice(0, 3)))
        expect(numbers).toEqual(files.map((_, index) => index + 1))
    })

    it('each export both up and down', async () => {
        for (const migration of await loadMigrations()) {
            expect(typeof migration.up, `${migration.name} must export up`).toBe('function')
            expect(typeof migration.down, `${migration.name} must export down`).toBe('function')
        }
    })
})

describe('migration reversibility', () => {
    const env = inject('e2eEnv')
    const database = 'migration_roundtrip'
    let admin: Sequelize
    let sequelize: Sequelize
    let migrations: Migration[]

    const apply = (migration: Migration, step: 'up' | 'down') =>
        migration[step]({ name: migration.name, context: sequelize.getQueryInterface() })

    const applyAll = async (step: 'up' | 'down') => {
        const ordered = step === 'up' ? migrations : [...migrations].reverse()
        for (const migration of ordered) {
            await apply(migration, step)
        }
    }

    beforeAll(async () => {
        admin = createConnection(env)
        migrations = await loadMigrations()
    })

    beforeEach(async () => {
        await sequelize?.close()
        await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin.query(`CREATE DATABASE "${database}"`)
        sequelize = createConnection(env, database)
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('reverts each migration to exactly the schema it started from and re-applies it cleanly', async () => {
        for (const migration of migrations) {
            const before = await snapshotSchema(sequelize)
            await apply(migration, 'up')
            const after = await snapshotSchema(sequelize)

            await apply(migration, 'down')
            expect(await snapshotSchema(sequelize), `${migration.name} down() must undo its up()`).toEqual(before)

            await apply(migration, 'up')
            expect(await snapshotSchema(sequelize), `${migration.name} up() must re-apply after down()`).toEqual(after)
        }
    })

    it('reverts every migration in reverse order down to an empty schema and re-applies them all', async () => {
        const empty = await snapshotSchema(sequelize)
        await applyAll('up')
        const migrated = await snapshotSchema(sequelize)

        await applyAll('down')
        expect(await snapshotSchema(sequelize)).toEqual(empty)

        await applyAll('up')
        expect(await snapshotSchema(sequelize)).toEqual(migrated)
    })

    it('drops every enum type it created when reverted', async () => {
        await applyAll('up')
        await applyAll('down')

        expect((await snapshotSchema(sequelize)).enums).toEqual([])
    })
})
