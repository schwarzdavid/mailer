import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.addColumn('inbound_form_fields', 'position', {
        type: DataTypes.INTEGER,
        allowNull: true,
    })

    await queryInterface.sequelize.query(
        `UPDATE "inbound_form_fields" AS "field" SET "position" = "ordered"."position"
         FROM (
             SELECT "inboundFormFieldId",
                    row_number() OVER (PARTITION BY "inboundFormId" ORDER BY "inboundFormFieldId") - 1 AS "position"
             FROM "inbound_form_fields"
         ) AS "ordered"
         WHERE "field"."inboundFormFieldId" = "ordered"."inboundFormFieldId"`,
    )

    await queryInterface.changeColumn('inbound_form_fields', 'position', {
        type: DataTypes.INTEGER,
        allowNull: false,
    })

    await queryInterface.addIndex('inbound_form_fields', ['inboundFormId', 'position'], {
        name: 'inbound_form_fields_position',
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeIndex('inbound_form_fields', 'inbound_form_fields_position')
    await queryInterface.removeColumn('inbound_form_fields', 'position')
}
