import type { MigrationFn } from 'umzug'
import { randomBytes } from 'node:crypto'
import { QueryTypes, type QueryInterface } from 'sequelize'

const CONSTRAINT_NAME = 'inbound_form_form_key_lowercase'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    const sequelize = queryInterface.sequelize
    await sequelize.query(`ALTER TABLE "inbound_form" ALTER COLUMN "formKey" TYPE VARCHAR(32)`)

    const collisions = await sequelize.query<{ inboundFormId: number }>(
        `SELECT "inboundFormId" FROM (
             SELECT "inboundFormId",
                    row_number() OVER (PARTITION BY lower("formKey") ORDER BY "inboundFormId") AS "position"
             FROM "inbound_form"
         ) AS "ranked" WHERE "position" > 1`,
        { type: QueryTypes.SELECT },
    )
    for (const { inboundFormId } of collisions) {
        await sequelize.query(`UPDATE "inbound_form" SET "formKey" = :formKey WHERE "inboundFormId" = :inboundFormId`, {
            replacements: { formKey: randomBytes(16).toString('hex'), inboundFormId },
        })
    }

    await sequelize.query(`UPDATE "inbound_form" SET "formKey" = lower("formKey") WHERE "formKey" <> lower("formKey")`)
    await sequelize.query(
        `ALTER TABLE "inbound_form" ADD CONSTRAINT "${CONSTRAINT_NAME}" CHECK ("formKey" = lower("formKey"))`,
    )
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    const sequelize = queryInterface.sequelize
    await queryInterface.removeConstraint('inbound_form', CONSTRAINT_NAME)

    const forms = await sequelize.query<{ inboundFormId: number }>(
        `SELECT "inboundFormId" FROM "inbound_form" WHERE length("formKey") > 22`,
        { type: QueryTypes.SELECT },
    )
    for (const { inboundFormId } of forms) {
        await sequelize.query(`UPDATE "inbound_form" SET "formKey" = :formKey WHERE "inboundFormId" = :inboundFormId`, {
            replacements: { formKey: randomBytes(16).toString('base64url'), inboundFormId },
        })
    }

    await sequelize.query(`ALTER TABLE "inbound_form" ALTER COLUMN "formKey" TYPE VARCHAR(22)`)
}
