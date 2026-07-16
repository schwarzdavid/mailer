import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('settings', {
        settingId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        sendingDomainId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'domains',
                key: 'domainId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        serverIpv4: {
            type: DataTypes.STRING(45),
            allowNull: false,
        },
        serverIpv6: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.removeIndex('domain_dns', ['host'])
    await queryInterface.addIndex('domain_dns', ['host', 'use'], {
        name: 'domain_dns_host_use_unique',
        unique: true,
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeIndex('domain_dns', 'domain_dns_host_use_unique')
    await queryInterface.addIndex('domain_dns', ['host'], { unique: true })
    await queryInterface.dropTable('settings')
}
