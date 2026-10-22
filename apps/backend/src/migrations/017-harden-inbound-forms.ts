import type { MigrationFn } from 'umzug'
import { type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(
        `ALTER TABLE "inbound_form" ADD COLUMN "allowedHostnames" TEXT[] NOT NULL DEFAULT '{}'`,
    )
    await queryInterface.sequelize.query(
        `UPDATE "inbound_form_security" SET "location" = 'body' WHERE "type" = 'honeypot'`,
    )
    await queryInterface.sequelize.query(`DELETE FROM "inbound_form_security" WHERE "type" = 'csrf'`)
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('inbound_form', 'allowedHostnames')
}
