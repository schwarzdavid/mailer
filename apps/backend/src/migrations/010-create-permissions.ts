import type { MigrationFn } from 'umzug'
import { DataTypes, type QueryInterface } from 'sequelize'

const GLOBAL_PERMISSIONS = [
    'domains.read',
    'domains.create',
    'domains.update',
    'domains.delete',
    'projects.create',
    'projects.all',
    'bounces.read',
    'bounces.block',
    'bounces.unblock',
    'settings.read',
    'settings.update',
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'roles.read',
]

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.createTable('roles', {
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(32),
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

    await queryInterface.addIndex('roles', ['name'], {
        name: 'roles_name_unique',
        unique: true,
    })

    await queryInterface.createTable('role_permissions', {
        rolePermissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'roles',
                key: 'roleId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        permission: {
            type: DataTypes.STRING(64),
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

    await queryInterface.addIndex('role_permissions', ['roleId', 'permission'], {
        name: 'role_permissions_unique',
        unique: true,
    })

    await queryInterface.createTable('user_permissions', {
        userPermissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'userId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        permission: {
            type: DataTypes.STRING(64),
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

    await queryInterface.addIndex('user_permissions', ['userId', 'permission'], {
        name: 'user_permissions_unique',
        unique: true,
    })

    await queryInterface.createTable('project_members', {
        projectMemberId: {
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
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'userId',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        permission: {
            type: DataTypes.STRING(16),
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

    await queryInterface.addIndex('project_members', ['projectId', 'userId', 'permission'], {
        name: 'project_members_unique',
        unique: true,
    })

    await queryInterface.addIndex('project_members', ['userId'], {
        name: 'project_members_user',
    })

    const [roleRows] = (await queryInterface.sequelize.query(
        `INSERT INTO "roles" ("name", "type", "createdAt", "updatedAt") VALUES
         ('Super Admin', 'super_admin', NOW(), NOW()),
         ('Admin', 'admin', NOW(), NOW()),
         ('User', 'user', NOW(), NOW())
         RETURNING "roleId", "type"`,
    )) as [{ roleId: number; type: string }[], unknown]

    const superAdminRoleId = roleRows.find((row) => row.type === 'super_admin')!.roleId
    const adminRoleId = roleRows.find((row) => row.type === 'admin')!.roleId

    await queryInterface.bulkInsert(
        'role_permissions',
        GLOBAL_PERMISSIONS.map((permission) => ({
            roleId: adminRoleId,
            permission,
            createdAt: new Date(),
            updatedAt: new Date(),
        })),
    )

    await queryInterface.addColumn('users', 'roleId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'roles',
            key: 'roleId',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
    })

    await queryInterface.sequelize.query('UPDATE "users" SET "roleId" = :roleId', {
        replacements: { roleId: superAdminRoleId },
    })

    await queryInterface.sequelize.query('ALTER TABLE "users" ALTER COLUMN "roleId" SET NOT NULL')
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('users', 'roleId')
    await queryInterface.dropTable('project_members')
    await queryInterface.dropTable('user_permissions')
    await queryInterface.dropTable('role_permissions')
    await queryInterface.dropTable('roles')
}
