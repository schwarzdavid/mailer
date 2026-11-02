import type { MigrationFn } from 'umzug'
import { type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(`DELETE FROM "role_permissions" WHERE "permission" = 'bounces.block'`)
    await queryInterface.sequelize.query(`DELETE FROM "user_permissions" WHERE "permission" = 'bounces.block'`)
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.query(
        `INSERT INTO "role_permissions" ("roleId", "permission", "createdAt", "updatedAt")
         SELECT "roleId", 'bounces.block', NOW(), NOW() FROM "roles" WHERE "type" = 'admin'`,
    )
}
