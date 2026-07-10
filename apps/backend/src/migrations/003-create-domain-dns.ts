import { MigrationFn } from 'umzug'
import { QueryInterface } from 'sequelize'
import { DataType } from 'sequelize-typescript'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('domain_dns', {
        dnsId: {
            autoIncrement: true,
            primaryKey: true,
            allowNull: false,
            type: DataType.INTEGER,
        },
        domainId: {
            type: DataType.INTEGER,
            allowNull: false,
            references: {
                model: 'domains',
                key: 'domainId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        type: {
            type: DataType.STRING(255),
            allowNull: false,
        },
        use: {
            type: DataType.STRING(255),
            allowNull: false,
        },
        status: {
            type: DataType.ENUM('valid', 'invalid'),
            allowNull: false,
        },
        host: {
            type: DataType.STRING(255),
            allowNull: false,
        },
        value: {
            type: DataType.TEXT,
            allowNull: false,
        },
        current: {
            type: DataType.TEXT,
            allowNull: true,
        },
        createdAt: {
            type: DataType.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: DataType.DATE,
            allowNull: false,
        },
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.dropTable('domain_dns')
}
