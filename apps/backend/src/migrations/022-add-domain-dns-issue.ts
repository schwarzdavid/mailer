import type { MigrationFn } from 'umzug'
import { type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(`ALTER TABLE "domain_dns" ADD COLUMN "issue" VARCHAR(32)`)
    await queryInterface.sequelize.query(
        `UPDATE "domain_dns" SET "issue" = CASE WHEN "status" = 'valid' THEN NULL WHEN "current" IS NULL THEN 'missing' ELSE 'mismatch' END`,
    )
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(`ALTER TABLE "domain_dns" DROP COLUMN "issue"`)
}
