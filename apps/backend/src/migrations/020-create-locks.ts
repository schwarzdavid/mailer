import type { MigrationFn } from 'umzug'
import { type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(
        `CREATE TABLE "locks" (
            "key" TEXT PRIMARY KEY,
            "owner" VARCHAR(255) NULL,
            "fencing_token" BIGINT NOT NULL DEFAULT 0,
            "expires_at" TIMESTAMPTZ NULL
        )`,
    )
    await queryInterface.sequelize.query(`CREATE SEQUENCE "locks_fencing_token_seq"`)
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(`DROP SEQUENCE "locks_fencing_token_seq"`)
    await queryInterface.sequelize.query(`DROP TABLE "locks"`)
}
