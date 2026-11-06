import { QueryTypes, type Sequelize } from 'sequelize'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createConnection, loadMigrations, type Migration } from './support/migrations.js'

const MIGRATION = '024-replace-form-slug-with-key.ts'

describe('024 replace form slug with key (e2e)', () => {
    const env = inject('e2eEnv')
    const database = 'form_key_migration'
    let admin: Sequelize
    let sequelize: Sequelize
    let target: Migration

    const run = (step: 'up' | 'down') => target[step]({ name: target.name, context: sequelize.getQueryInterface() })

    async function seedForm(slug: string): Promise<void> {
        const [projects] = (await sequelize.query(
            `INSERT INTO "projects" ("name", "createdAt", "updatedAt") VALUES (:slug, NOW(), NOW())
             RETURNING "projectId"`,
            { replacements: { slug } },
        )) as [{ projectId: number }[], unknown]
        await sequelize.query(
            `INSERT INTO "inbound_form" ("name", "slug", "projectId", "createdAt", "updatedAt")
             VALUES ('Migration', :slug, :projectId, NOW(), NOW())`,
            { replacements: { slug, projectId: projects[0]!.projectId } },
        )
    }

    async function columnNames(): Promise<string[]> {
        const columns = await sequelize.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name = 'inbound_form' AND column_name IN ('slug', 'formKey')`,
            { type: QueryTypes.SELECT },
        )
        return columns.map((column) => column.column_name)
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

    it('replaces every slug with a distinct generated form key', async () => {
        await seedForm('contact')
        await seedForm('newsletter')

        await run('up')

        expect(await columnNames()).toEqual(['formKey'])
        const forms = await sequelize.query<{ formKey: string }>('SELECT "formKey" FROM "inbound_form"', {
            type: QueryTypes.SELECT,
        })
        const keys = forms.map((form) => form.formKey)
        expect(keys).toHaveLength(2)
        for (const key of keys) {
            expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/)
        }
        expect(new Set(keys).size).toBe(2)
    })

    it('keeps the form key unique', async () => {
        const [existing] = await sequelize.query<{ formKey: string; projectId: number }>(
            'SELECT "formKey", "projectId" FROM "inbound_form" LIMIT 1',
            { type: QueryTypes.SELECT },
        )

        await expect(
            sequelize.query(
                `INSERT INTO "inbound_form" ("name", "formKey", "projectId", "createdAt", "updatedAt")
                 VALUES ('Duplicate', :formKey, :projectId, NOW(), NOW())`,
                { replacements: { formKey: existing!.formKey, projectId: existing!.projectId } },
            ),
        ).rejects.toThrow()
    })

    it('restores the slug column with a slug per form on down', async () => {
        await run('down')

        expect(await columnNames()).toEqual(['slug'])
        const forms = await sequelize.query<{ inboundFormId: number; slug: string }>(
            'SELECT "inboundFormId", "slug" FROM "inbound_form" ORDER BY "inboundFormId"',
            { type: QueryTypes.SELECT },
        )
        expect(forms.map((form) => form.slug)).toEqual(forms.map((form) => `form-${form.inboundFormId}`))
    })
})
