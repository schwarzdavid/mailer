import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'

const MIGRATION = '023-remove-settings-server-ips.ts'

interface ServerIpsRow {
    sendingDomainId: number | null
    serverIpv4: string
    serverIpv6: string | null
}

describe('023 remove settings server ips (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'settings_server_ips_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function settingsColumns(): Promise<{ column_name: string; is_nullable: string }[]> {
        return sequelize.query<{ column_name: string; is_nullable: string }>(
            `SELECT "column_name", "is_nullable" FROM information_schema.columns
             WHERE table_name = 'settings' AND column_name IN ('serverIpv4', 'serverIpv6') ORDER BY "column_name"`,
            { type: QueryTypes.SELECT },
        )
    }

    async function seedRecord(domainId: number, use: 'a' | 'aaaa' | 'spf', value: string): Promise<void> {
        await sequelize.query(
            `INSERT INTO "domain_dns" ("domainId", "type", "use", "status", "host", "value", "current", "createdAt", "updatedAt")
             VALUES (:domainId, :type, :use, 'invalid', 'mail.migration.test', :value, NULL, NOW(), NOW())`,
            { replacements: { domainId, type: use === 'spf' ? 'txt' : use, use, value } },
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
        await sequelize.query('TRUNCATE "settings", "domain_dns", "domains" RESTART IDENTITY CASCADE')
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('drops the server address columns', async () => {
        await run('up')

        expect(await settingsColumns()).toEqual([])

        await run('down')
    })

    it('restores the addresses from the sending domain records when reverted', async () => {
        await run('up')
        const [domains] = (await sequelize.query(
            `INSERT INTO "domains" ("fqdn", "rootDomain", "createdAt", "updatedAt")
             VALUES ('mail.migration.test', 'migration.test', NOW(), NOW()) RETURNING "domainId"`,
        )) as [{ domainId: number }[], unknown]
        const domainId = domains[0]!.domainId
        await seedRecord(domainId, 'a', '203.0.113.10')
        await seedRecord(domainId, 'aaaa', '2001:db8::10')
        await seedRecord(domainId, 'spf', 'v=spf1 ip4:203.0.113.10 ip6:2001:db8::10 -all')
        await sequelize.query(
            `INSERT INTO "settings" ("sendingDomainId", "createdAt", "updatedAt")
             VALUES (:domainId, NOW(), NOW()), (NULL, NOW(), NOW())`,
            { replacements: { domainId } },
        )

        await run('down')

        const rows = await sequelize.query<ServerIpsRow>(
            'SELECT "sendingDomainId", "serverIpv4", "serverIpv6" FROM "settings" ORDER BY "settingId"',
            { type: QueryTypes.SELECT },
        )
        expect(rows).toEqual([
            { sendingDomainId: domainId, serverIpv4: '203.0.113.10', serverIpv6: '2001:db8::10' },
            { sendingDomainId: null, serverIpv4: '0.0.0.0', serverIpv6: null },
        ])
        expect(await settingsColumns()).toEqual([
            { column_name: 'serverIpv4', is_nullable: 'NO' },
            { column_name: 'serverIpv6', is_nullable: 'YES' },
        ])
    })
})
