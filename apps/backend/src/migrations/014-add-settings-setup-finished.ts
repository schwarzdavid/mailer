import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.addColumn('settings', 'setupFinishedAt', {
        type: DataTypes.DATE,
        allowNull: true,
    })

    await queryInterface.sequelize.query(
        `UPDATE "settings" SET "setupFinishedAt" = NOW()
         WHERE "sendingDomainId" IS NOT NULL AND EXISTS (SELECT 1 FROM "users")`,
    )
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('settings', 'setupFinishedAt')
}
