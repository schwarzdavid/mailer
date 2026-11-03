import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'

const MIGRATION = '022-add-domain-dns-issue.ts'

describe('022 add domain dns issue (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'domain_dns_issue_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function seedRecord(host: string, status: 'valid' | 'invalid', current: string | null): Promise<void> {
        await sequelize.query(
            `INSERT INTO "domain_dns" ("domainId", "type", "use", "status", "host", "value", "current", "createdAt", "updatedAt")
             VALUES (1, 'txt', 'spf', :status, :host, 'v=spf1 include:mail.migration.test ~all', :current, NOW(), NOW())`,
            { replacements: { host, status, current } },
        )
    }

    async function issues(): Promise<{ host: string; issue: string | null }[]> {
        return sequelize.query<{ host: string; issue: string | null }>(
            'SELECT "host", "issue" FROM "domain_dns" ORDER BY "host"',
            { type: QueryTypes.SELECT },
        )
    }

    async function hasIssueColumn(): Promise<boolean> {
        const rows = await sequelize.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name = 'domain_dns' AND column_name = 'issue'`,
            { type: QueryTypes.SELECT },
        )
        return rows.length > 0
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
        await sequelize.query('TRUNCATE "domain_dns", "domains" RESTART IDENTITY CASCADE')
        await sequelize.query(
            `INSERT INTO "domains" ("fqdn", "rootDomain", "createdAt", "updatedAt")
             VALUES ('migration.test', 'migration.test', NOW(), NOW())`,
        )
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('backfills the issue from the stored status and current value', async () => {
        await seedRecord('a.migration.test', 'valid', 'v=spf1 include:mail.migration.test ~all')
        await seedRecord('b.migration.test', 'invalid', null)
        await seedRecord('c.migration.test', 'invalid', 'v=spf1 -all')

        await run('up')

        expect(await issues()).toEqual([
            { host: 'a.migration.test', issue: null },
            { host: 'b.migration.test', issue: 'missing' },
            { host: 'c.migration.test', issue: 'mismatch' },
        ])

        await run('down')
    })

    it('drops the issue column when reverted', async () => {
        await run('up')
        expect(await hasIssueColumn()).toBe(true)

        await run('down')
        expect(await hasIssueColumn()).toBe(false)
    })
})
