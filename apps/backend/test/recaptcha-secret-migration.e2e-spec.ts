import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'
import { decryptSecret } from '../src/helpers/secret-encryption.js'

const MIGRATION = '013-encrypt-recaptcha-secrets.ts'

interface SecurityRow {
    type: string
    config: Record<string, unknown> | null
}

describe('013 encrypt recaptcha secrets (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'recaptcha_secret_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration
    let masterSecret: string | undefined

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function securityRows(): Promise<SecurityRow[]> {
        return sequelize.query<SecurityRow>(
            'SELECT "type", "config" FROM "inbound_form_security" ORDER BY "inboundFormSecurityId"',
            { type: QueryTypes.SELECT },
        )
    }

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

    async function seedScheme(inboundFormId: number, type: string, config: object | null): Promise<void> {
        await sequelize.query(
            `INSERT INTO "inbound_form_security" ("inboundFormId", "type", "location", "key", "config", "createdAt", "updatedAt")
             VALUES (:inboundFormId, :type, 'body', 'token', CAST(:config AS jsonb), NOW(), NOW())`,
            { replacements: { inboundFormId, type, config: config === null ? null : JSON.stringify(config) } },
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
        masterSecret = process.env.BACKEND_ENCRYPTION_SECRET
        await sequelize.query('TRUNCATE "inbound_form", "projects" RESTART IDENTITY CASCADE')
    })

    afterEach(() => {
        process.env.BACKEND_ENCRYPTION_SECRET = masterSecret
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('encrypts plaintext secrets on up and restores them on down', async () => {
        const inboundFormId = await seedForm('migration-roundtrip')
        await seedScheme(inboundFormId, 'google-recaptcha', { secret: 'plain-recaptcha-secret', minScore: 0.4 })
        await seedScheme(inboundFormId, 'honeypot', null)

        await run('up')

        const [recaptcha, honeypot] = await securityRows()
        expect(Object.keys(recaptcha!.config!).sort()).toEqual(['encryptedSecret', 'minScore'])
        expect(recaptcha!.config!.minScore).toBe(0.4)
        const encryptedSecret = String(recaptcha!.config!.encryptedSecret)
        expect(encryptedSecret).toMatch(/^v1\./)
        expect(encryptedSecret).not.toContain('plain-recaptcha-secret')
        await expect(decryptSecret(encryptedSecret, env.BACKEND_ENCRYPTION_SECRET)).resolves.toBe(
            'plain-recaptcha-secret',
        )
        expect(honeypot!.config).toBeNull()

        await run('down')

        expect(await securityRows()).toEqual([
            { type: 'google-recaptcha', config: { secret: 'plain-recaptcha-secret', minScore: 0.4 } },
            { type: 'honeypot', config: null },
        ])
    })

    it('leaves already encrypted secrets untouched when run again', async () => {
        const inboundFormId = await seedForm('migration-idempotent')
        await seedScheme(inboundFormId, 'google-recaptcha', { secret: 'plain-recaptcha-secret' })

        await run('up')
        const [first] = await securityRows()
        await run('up')

        expect(await securityRows()).toEqual([first])
        expect(Object.keys(first!.config!)).toEqual(['encryptedSecret'])
    })

    it('needs no master secret when there is nothing to migrate', async () => {
        delete process.env.BACKEND_ENCRYPTION_SECRET

        await expect(run('up')).resolves.toBeUndefined()
        await expect(run('down')).resolves.toBeUndefined()
    })

    it('refuses to migrate stored secrets without the master secret', async () => {
        const inboundFormId = await seedForm('migration-missing-secret')
        await seedScheme(inboundFormId, 'google-recaptcha', { secret: 'plain-recaptcha-secret' })
        delete process.env.BACKEND_ENCRYPTION_SECRET

        await expect(run('up')).rejects.toThrow('BACKEND_ENCRYPTION_SECRET must be set')
        expect(await securityRows()).toEqual([
            { type: 'google-recaptcha', config: { secret: 'plain-recaptcha-secret' } },
        ])
    })
})
