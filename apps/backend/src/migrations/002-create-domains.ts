import type { MigrationParams } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up = async ({ context: queryInterface }: MigrationParams<QueryInterface>) => {
    await queryInterface.createTable('domains', {
        domainId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        fqdn: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        activeDkimId: {
            type: DataTypes.INTEGER,
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

    await queryInterface.createTable('domain_dkim', {
        dkimId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        domainId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'domains',
                key: 'domainId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        selector: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        algorithm: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        keyBits: {
            type: DataTypes.SMALLINT,
            allowNull: false,
        },
        privateKey: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        publicKey: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    })

    // Added after both tables exist to resolve the circular foreign key between
    // domains.activeDkimId and domain_dkim.domainId.
    await queryInterface.addConstraint('domains', {
        type: 'foreign key',
        name: 'domains_activeDkimId_fkey',
        fields: ['activeDkimId'],
        references: {
            table: 'domain_dkim',
            field: 'dkimId',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
}

export const down = async ({ context: queryInterface }: MigrationParams<QueryInterface>) => {
    await queryInterface.removeConstraint('domains', 'domains_activeDkimId_fkey')
    await queryInterface.dropTable('domain_dkim')
    await queryInterface.dropTable('domains')
}
