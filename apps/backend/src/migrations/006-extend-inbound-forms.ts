import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.addColumn('inbound_form_fields', 'type', {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'text',
    })

    await queryInterface.addColumn('inbound_form_security', 'config', {
        type: DataTypes.JSONB,
        allowNull: true,
    })

    await queryInterface.addIndex('inbound_form_security', ['inboundFormId', 'type'], {
        name: 'form_security_type_unique',
        unique: true,
    })

    await queryInterface.addColumn('inbound_form_receiver', 'emailReplyTo', {
        type: DataTypes.STRING(255),
        allowNull: true,
    })

    await queryInterface.addColumn('inbound_form_template', 'subject', {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
    })

    await queryInterface.addColumn('inbound_form_template', 'updatedAt', {
        type: DataTypes.DATE,
        allowNull: true,
    })
    await queryInterface.sequelize.query('UPDATE "inbound_form_template" SET "updatedAt" = "createdAt"')
    await queryInterface.changeColumn('inbound_form_template', 'updatedAt', {
        type: DataTypes.DATE,
        allowNull: false,
    })

    await queryInterface.addIndex('inbound_form_template', ['inboundFormReceiverId'], {
        name: 'template_single_draft',
        unique: true,
        where: { status: 'draft' },
    })

    await queryInterface.createTable('inbound_form_submission', {
        inboundFormSubmissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        inboundFormId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'inbound_form',
                key: 'inboundFormId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        data: {
            type: DataTypes.JSONB,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.createTable('inbound_form_delivery', {
        inboundFormDeliveryId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        inboundFormSubmissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'inbound_form_submission',
                key: 'inboundFormSubmissionId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        inboundFormReceiverId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'inbound_form_receiver',
                key: 'inboundFormReceiverId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        inboundFormTemplateId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'inbound_form_template',
                key: 'inboundFormTemplateId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        emailFrom: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        emailTo: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        error: {
            type: DataTypes.TEXT,
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
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.dropTable('inbound_form_delivery')
    await queryInterface.dropTable('inbound_form_submission')
    await queryInterface.removeIndex('inbound_form_template', 'template_single_draft')
    await queryInterface.removeColumn('inbound_form_template', 'updatedAt')
    await queryInterface.removeColumn('inbound_form_template', 'subject')
    await queryInterface.removeColumn('inbound_form_receiver', 'emailReplyTo')
    await queryInterface.removeIndex('inbound_form_security', 'form_security_type_unique')
    await queryInterface.removeColumn('inbound_form_security', 'config')
    await queryInterface.removeColumn('inbound_form_fields', 'type')
}
