import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('bounce', {
        bounceId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        emailAddress: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        statusCode: {
            type: DataTypes.STRING(16),
            allowNull: true,
        },
        reason: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        messageId: {
            type: DataTypes.STRING(998),
            allowNull: true,
        },
        receivedAt: {
            type: DataTypes.DATE,
            allowNull: false,
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

    await queryInterface.addIndex('bounce', ['emailAddress'], {
        name: 'bounce_email_address',
    })

    await queryInterface.addIndex('bounce', ['messageId', 'emailAddress'], {
        name: 'bounce_message_id_email_address_unique',
        unique: true,
    })

    await queryInterface.createTable('email_block', {
        emailBlockId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        emailAddress: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        blockCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        blockedUntil: {
            type: DataTypes.DATE,
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

    await queryInterface.addIndex('email_block', ['emailAddress'], {
        name: 'email_block_email_address_unique',
        unique: true,
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.dropTable('email_block')
    await queryInterface.dropTable('bounce')
}
