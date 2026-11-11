import type { MigrationFn } from 'umzug'
import { randomBytes } from 'node:crypto'
import { QueryTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    const sequelize = queryInterface.sequelize
    await sequelize.query(`ALTER TABLE "inbound_form" RENAME COLUMN "slug" TO "formKey"`)
    await sequelize.query(`ALTER INDEX "inbound_form_slug_unique" RENAME TO "inbound_form_form_key_unique"`)

    const forms = await sequelize.query<{ inboundFormId: number }>(`SELECT "inboundFormId" FROM "inbound_form"`, {
        type: QueryTypes.SELECT,
    })
    for (const { inboundFormId } of forms) {
        await sequelize.query(`UPDATE "inbound_form" SET "formKey" = :formKey WHERE "inboundFormId" = :inboundFormId`, {
            replacements: { formKey: randomBytes(16).toString('base64url'), inboundFormId },
        })
    }

    await sequelize.query(`ALTER TABLE "inbound_form" ALTER COLUMN "formKey" TYPE VARCHAR(22)`)
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    const sequelize = queryInterface.sequelize
    await sequelize.query(`ALTER TABLE "inbound_form" ALTER COLUMN "formKey" TYPE VARCHAR(255)`)
    await sequelize.query(`UPDATE "inbound_form" SET "formKey" = 'form-' || "inboundFormId"`)
    await sequelize.query(`ALTER INDEX "inbound_form_form_key_unique" RENAME TO "inbound_form_slug_unique"`)
    await sequelize.query(`ALTER TABLE "inbound_form" RENAME COLUMN "formKey" TO "slug"`)
}
