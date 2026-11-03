import type { MigrationFn } from 'umzug'
import { type QueryInterface } from 'sequelize'

const COMMENT =
    'Hostnames are capped at 253 characters: the DNS limit of 255 octets (RFC 1035) includes one length octet per label and the terminating root octet, which leaves 253 for the dotted text form.'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(
        `ALTER TABLE "inbound_form" ALTER COLUMN "allowedHostnames" TYPE VARCHAR(253)[] USING "allowedHostnames"::VARCHAR(253)[]`,
    )
    await queryInterface.sequelize.query(`COMMENT ON COLUMN "inbound_form"."allowedHostnames" IS :comment`, {
        replacements: { comment: COMMENT },
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(`COMMENT ON COLUMN "inbound_form"."allowedHostnames" IS NULL`)
    await queryInterface.sequelize.query(
        `ALTER TABLE "inbound_form" ALTER COLUMN "allowedHostnames" TYPE TEXT[] USING "allowedHostnames"::TEXT[]`,
    )
}
