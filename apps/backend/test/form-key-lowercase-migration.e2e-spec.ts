import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'

const MIGRATION = '025-lowercase-form-keys.ts'

describe('025 lowercase form keys (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'form_key_lowercase_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration
    let projectId = 0

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function insertForm(formKey: string): Promise<void> {
        await sequelize.query(
            `INSERT INTO "inbound_form" ("name", "formKey", "projectId", "createdAt", "updatedAt")
             VALUES ('Migration', :formKey, :projectId, NOW(), NOW())`,
            { replacements: { formKey, projectId } },
        )
    }

    async function formKeys(): Promise<string[]> {
        const forms = await sequelize.query<{ formKey: string }>(
            'SELECT "formKey" FROM "inbound_form" ORDER BY "inboundFormId"',
            { type: QueryTypes.SELECT },
        )
        return forms.map((form) => form.formKey)
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

        const [projects] = (await sequelize.query(
            `INSERT INTO "projects" ("name", "createdAt", "updatedAt") VALUES ('Migration', NOW(), NOW())
             RETURNING "projectId"`,
        )) as [{ projectId: number }[], unknown]
        projectId = projects[0]!.projectId
    })

    afterAll(async () => {
        await sequelize?.close()
        await admin?.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
        await admin?.close()
    })

    it('lowercases existing keys and gives keys that collide by case a new key', async () => {
        await insertForm('Xk3_a-9QpLm2Zr7Tb1Wv0c')
        await insertForm('XK3_A-9QPLM2ZR7TB1WV0C')
        await insertForm('nw5_b-2rqkn8ys4uc6xz1d')

        await run('up')

        const [first, second, third] = await formKeys()
        expect(first).toBe('xk3_a-9qplm2zr7tb1wv0c')
        expect(second).toMatch(/^[0-9a-f]{32}$/)
        expect(third).toBe('nw5_b-2rqkn8ys4uc6xz1d')
    })

    it('stores a 32-character lowercase key', async () => {
        await insertForm('0123456789abcdef0123456789abcdef')

        expect(await formKeys()).toContain('0123456789abcdef0123456789abcdef')
    })

    it('refuses a key with uppercase letters', async () => {
        await expect(insertForm('ABCDEF0123456789ABCDEF0123456789')).rejects.toThrow()
    })

    it('refuses a key that differs from an existing one only by case', async () => {
        await expect(insertForm('XK3_A-9QPLM2ZR7TB1WV0C')).rejects.toThrow()
    })

    it('fits every key back into 22 characters on down', async () => {
        await run('down')

        const keys = await formKeys()
        expect(keys).toHaveLength(4)
        for (const key of keys) {
            expect(key.length).toBeLessThanOrEqual(22)
        }
        expect(keys[0]).toBe('xk3_a-9qplm2zr7tb1wv0c')
        await expect(insertForm('Mixed-Case-Allowed-Abc')).resolves.toBeUndefined()
    })
})
