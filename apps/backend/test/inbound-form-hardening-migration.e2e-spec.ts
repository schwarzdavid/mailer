import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'

const MIGRATION = '017-harden-inbound-forms.ts'

interface SecurityRow {
    type: string
    location: string
}

describe('017 harden inbound forms (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'inbound_form_hardening_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function seedForm(slug: string): Promise<number> {
        const [projects] = (await sequelize.query(
            `INSERT INTO "projects" ("name", "createdAt", "updatedAt") VALUES ('Migration', NOW(), NOW())
             RETURNING "projectId"`,
        )) as [{ projectId: number }[], unknown]
        const [forms] = (await sequelize.query(
            `INSERT INTO "inbound_form" ("name", "slug", "projectId", "createdAt", "updatedAt")
             VALUES ('Migration', :slug, :projectId, NOW(), NOW()) RETURNING "inboundFormId"`,
            { replacements: { slug, projectId: projects[0]!.projectId } },
        )) as [{ inboundFormId: number }[], unknown]
        return forms[0]!.inboundFormId
    }

    async function seedScheme(inboundFormId: number, type: string, location: string, key: string): Promise<void> {
        await sequelize.query(
            `INSERT INTO "inbound_form_security" ("inboundFormId", "type", "location", "key", "createdAt", "updatedAt")
             VALUES (:inboundFormId, :type, :location, :key, NOW(), NOW())`,
            { replacements: { inboundFormId, type, location, key } },
        )
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

    beforeEach(async () => {
        await sequelize.query('TRUNCATE "inbound_form", "projects" RESTART IDENTITY CASCADE')
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('moves honeypots to the body, drops csrf schemes and defaults existing forms to no hostnames', async () => {
        const inboundFormId = await seedForm('hardening-up')
        await seedScheme(inboundFormId, 'honeypot', 'header', 'x-trap')
        await seedScheme(inboundFormId, 'csrf', 'header', 'x-csrf')

        await run('up')

        const schemes = await sequelize.query<SecurityRow>('SELECT "type", "location" FROM "inbound_form_security"', {
            type: QueryTypes.SELECT,
        })
        expect(schemes).toEqual([{ type: 'honeypot', location: 'body' }])
        const forms = await sequelize.query<{ allowedHostnames: string[] }>(
            'SELECT "allowedHostnames" FROM "inbound_form"',
            { type: QueryTypes.SELECT },
        )
        expect(forms).toEqual([{ allowedHostnames: [] }])
    })

    it('drops the column on down', async () => {
        await run('down')

        const columns = await sequelize.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name = 'inbound_form' AND column_name = 'allowedHostnames'`,
            { type: QueryTypes.SELECT },
        )
        expect(columns).toEqual([])
    })
})
