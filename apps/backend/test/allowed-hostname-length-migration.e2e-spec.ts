import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'

const MIGRATION = '018-limit-allowed-hostname-length.ts'

interface ColumnShape {
    type: string
    comment: string | null
}

describe('018 limit allowed hostname length (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'allowed_hostname_length_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function columnShape(): Promise<ColumnShape | undefined> {
        const [row] = await sequelize.query<ColumnShape>(
            `SELECT format_type(attribute.atttypid, attribute.atttypmod) AS "type",
                    col_description(attribute.attrelid, attribute.attnum) AS "comment"
             FROM pg_attribute attribute
             WHERE attribute.attrelid = '"inbound_form"'::regclass AND attribute.attname = 'allowedHostnames'`,
            { type: QueryTypes.SELECT },
        )
        return row
    }

    beforeAll(async () => {
        admin = createConnection(env)
        const migrations = await loadMigrations()
        target = migrations.find((migration) => migration.name === MIGRATION)!

        await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin.query(`CREATE DATABASE "${database}"`)
        sequelize = createConnection(env, database)
        for (const migration of migrations.filter((migration) => migration.name < MIGRATION)) {
            await migration.up({ name: migration.name, context: sequelize.getQueryInterface() })
        }
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('limits hostnames to 253 characters and documents why', async () => {
        await run('up')

        const shape = await columnShape()
        expect(shape?.type).toBe('character varying(253)[]')
        expect(shape?.comment).toContain('253')
    })

    it('restores the text array without comment on down', async () => {
        await run('up')
        await run('down')

        expect(await columnShape()).toEqual({ type: 'text[]', comment: null })
    })
})
