import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('api_keys', {
        apiKeyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        projectId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'projects',
                key: 'projectId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        prefix: {
            type: DataTypes.STRING(16),
            allowNull: false,
        },
        secretHash: {
            type: DataTypes.CHAR(64),
            allowNull: false,
        },
        createdByUserId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'userId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        lastUsedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        revokedAt: {
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

    await queryInterface.addIndex('api_keys', ['prefix'], {
        name: 'api_keys_prefix_unique',
        unique: true,
    })

    await queryInterface.addIndex('api_keys', ['projectId'], {
        name: 'api_keys_project_id',
    })

    await queryInterface.createTable('mail_messages', {
        mailMessageId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        projectId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'projects',
                key: 'projectId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        source: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        apiKeyId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'api_keys',
                key: 'apiKeyId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        emailFrom: {
            type: DataTypes.STRING(320),
            allowNull: false,
        },
        emailTo: {
            type: DataTypes.STRING(320),
            allowNull: false,
        },
        subject: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(32),
            allowNull: false,
        },
        error: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        smtpMessageId: {
            type: DataTypes.STRING(998),
            allowNull: true,
        },
        sentAt: {
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

    await queryInterface.addIndex('mail_messages', ['projectId', 'mailMessageId'], {
        name: 'mail_messages_project_id_mail_message_id',
    })

    await queryInterface.addIndex('mail_messages', ['smtpMessageId'], {
        name: 'mail_messages_smtp_message_id',
    })

    await queryInterface.addColumn('inbound_form_delivery', 'mailMessageId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'mail_messages',
            key: 'mailMessageId',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('inbound_form_delivery', 'mailMessageId')
    await queryInterface.dropTable('mail_messages')
    await queryInterface.dropTable('api_keys')
}
