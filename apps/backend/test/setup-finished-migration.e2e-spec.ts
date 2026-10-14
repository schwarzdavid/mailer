import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'

const MIGRATION = '014-add-settings-setup-finished.ts'

describe('014 add settings setup finished (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'setup_finished_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function seedUser(): Promise<void> {
        const [roles] = (await sequelize.query(`SELECT "roleId" FROM "roles" WHERE "type" = 'super_admin'`)) as [
            { roleId: number }[],
            unknown,
        ]
        await sequelize.query(
            `INSERT INTO "users" ("firstName", "lastName", "email", "password", "roleId", "createdAt", "updatedAt")
             VALUES ('Ada', 'Lovelace', 'ada@migration.test', 'hash', :roleId, NOW(), NOW())`,
            { replacements: { roleId: roles[0]!.roleId } },
        )
    }

    async function seedSettings(withSendingDomain: boolean): Promise<void> {
        let sendingDomainId: number | null = null
        if (withSendingDomain) {
            const [domains] = (await sequelize.query(
                `INSERT INTO "domains" ("fqdn", "rootDomain", "createdAt", "updatedAt")
                 VALUES ('mail.migration.test', 'migration.test', NOW(), NOW()) RETURNING "domainId"`,
            )) as [{ domainId: number }[], unknown]
            sendingDomainId = domains[0]!.domainId
        }
        await sequelize.query(
            `INSERT INTO "settings" ("sendingDomainId", "serverIpv4", "createdAt", "updatedAt")
             VALUES (:sendingDomainId, '203.0.113.10', NOW(), NOW())`,
            { replacements: { sendingDomainId } },
        )
    }

    async function setupFinishedAt(): Promise<(Date | null)[]> {
        const rows = await sequelize.query<{ setupFinishedAt: Date | null }>(
            'SELECT "setupFinishedAt" FROM "settings" ORDER BY "settingId"',
            { type: QueryTypes.SELECT },
        )
        return rows.map((row) => row.setupFinishedAt)
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
        await sequelize.query('TRUNCATE "settings", "users", "domains" RESTART IDENTITY CASCADE')
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('treats an installation with a user and a sending domain as finished', async () => {
        await seedUser()
        await seedSettings(true)

        await run('up')

        const [finishedAt] = await setupFinishedAt()
        expect(finishedAt).toBeInstanceOf(Date)

        await run('down')
    })

    it('leaves the setup open while no sending domain is configured', async () => {
        await seedUser()
        await seedSettings(false)

        await run('up')

        expect(await setupFinishedAt()).toEqual([null])

        await run('down')
    })

    it('leaves the setup open while no user exists', async () => {
        await seedSettings(true)

        await run('up')

        expect(await setupFinishedAt()).toEqual([null])

        await run('down')
    })
})
