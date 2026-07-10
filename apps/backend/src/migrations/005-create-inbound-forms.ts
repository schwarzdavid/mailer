import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('inbound_form', {
        inboundFormId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        domainId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'domains',
                key: 'domainId',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        slug: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
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

    await queryInterface.addIndex('inbound_form', ['slug'], {
        name: 'inbound_form_slug_unique',
        unique: true,
    })

    await queryInterface.createTable('inbound_form_fields', {
        inboundFormFieldId: {
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
        key: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        label: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        defaultValue: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        validation: {
            type: DataTypes.JSON,
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

    await queryInterface.addIndex('inbound_form_fields', ['inboundFormId', 'key'], {
        name: 'form_key_unique',
        unique: true,
    })

    await queryInterface.createTable('inbound_form_security', {
        inboundFormSecurityId: {
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
        location: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        key: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(255),
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

    await queryInterface.createTable('inbound_form_receiver', {
        inboundFormReceiverId: {
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
        emailReceiver: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        emailFrom: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
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

    await queryInterface.createTable('inbound_form_template', {
        inboundFormTemplateId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        inboundFormReceiverId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'inbound_form_receiver',
                key: 'inboundFormReceiverId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        template: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        version: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    })

    await queryInterface.addIndex('inbound_form_template', ['inboundFormReceiverId', 'version'], {
        name: 'template_version',
        unique: true,
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.dropTable('inbound_form_template')
    await queryInterface.dropTable('inbound_form_receiver')
    await queryInterface.dropTable('inbound_form_security')
    await queryInterface.dropTable('inbound_form_fields')
    await queryInterface.dropTable('inbound_form')
}
