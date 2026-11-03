import type { MigrationFn } from 'umzug'
import { type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(
        `ALTER TABLE "inbound_form_delivery" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0`,
    )
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(`ALTER TABLE "inbound_form_delivery" DROP COLUMN "attempts"`)
}
