import type { MigrationParams } from 'umzug';
import { DataTypes, type QueryInterface } from 'sequelize';

export const up = async ({ context: queryInterface }: MigrationParams<QueryInterface>) => {
    await queryInterface.createTable('users', {
        userId: {
            type: DataTypes.BIGINT,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        firstName: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        lastName: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        password: {
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
    });

    await queryInterface.addIndex('users', ['email'], {
        name: 'users_email_unique',
        unique: true,
    });
};

export const down = async ({ context: queryInterface }: MigrationParams<QueryInterface>) => {
    await queryInterface.dropTable('users');
};
