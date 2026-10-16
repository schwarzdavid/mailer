import type { MigrationFn } from 'umzug'
import { DataTypes, QueryTypes, type QueryInterface, type Transaction } from 'sequelize'

const ROLE_MANAGEMENT_PERMISSIONS = ['roles.create', 'roles.update', 'roles.delete']

const PROJECT_PERMISSIONS = ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage']

const LEGACY_UPDATE_EXPANSION = ['update', 'forms.manage', 'api_keys.manage', 'members.manage']

const GLOBAL_ROLE_DESCRIPTIONS: Record<string, string> = {
    super_admin: 'Every permission, including changing other Super admins',
    admin: "Every permission, but can't change Super admins",
    user: 'No permissions of its own; add them per user or through project memberships',
}

const PROJECT_ROLES = [
    { name: 'Viewer', description: 'Sees the project, its forms and sent mail.', permissions: ['read'] },
    { name: 'Editor', description: 'Builds forms and templates.', permissions: ['read', 'forms.manage'] },
    {
        name: 'Maintainer',
        description: 'Runs the project day to day: forms, API keys, members and domains.',
        permissions: ['read', 'update', 'forms.manage', 'api_keys.manage', 'members.manage'],
    },
    { name: 'Owner', description: 'Everything, including deleting the project.', permissions: PROJECT_PERMISSIONS },
]

interface LegacyMemberRow {
    projectId: number
    userId: number
    permission: string
}

interface MemberRow {
    projectMemberId: number
    projectId: number
    userId: number
    roleId: number
}

interface RolePermissionRow {
    roleId: number
    permission: string
}

interface MemberPermissionRow {
    projectMemberId: number
    permission: string
}

interface SeededRole {
    roleId: number
    permissions: string[]
}

const timestamps = {
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
}

function stamped<T extends object>(row: T): T & { createdAt: Date; updatedAt: Date } {
    return { ...row, createdAt: new Date(), updatedAt: new Date() }
}

function expandLegacyPermissions(permissions: string[]): string[] {
    const expanded = new Set(['read', ...permissions])
    if (permissions.includes('update')) {
        for (const permission of LEGACY_UPDATE_EXPANSION) {
            expanded.add(permission)
        }
    }
    return PROJECT_PERMISSIONS.filter((permission) => expanded.has(permission))
}

function pickLargestCoveredRole(roles: SeededRole[], effective: string[]): SeededRole {
    return roles
        .filter((role) => role.permissions.every((permission) => effective.includes(permission)))
        .reduce((best, role) => (role.permissions.length > best.permissions.length ? role : best))
}

function collapseToLegacy(effective: string[]): string[] {
    const legacy = new Set<string>()
    for (const permission of effective) {
        if (permission === 'read' || permission === 'delete') {
            legacy.add(permission)
        } else if (LEGACY_UPDATE_EXPANSION.includes(permission)) {
            legacy.add('update')
        }
    }
    return ['read', 'update', 'delete'].filter((permission) => legacy.has(permission))
}

async function createMemberTables(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
    await queryInterface.createTable(
        'project_members',
        {
            projectMemberId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
            projectId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'projects', key: 'projectId' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'userId' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
            },
            roleId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'roles', key: 'roleId' },
                onDelete: 'RESTRICT',
                onUpdate: 'CASCADE',
            },
            ...timestamps,
        },
        { transaction },
    )
    await queryInterface.addIndex('project_members', ['projectId', 'userId'], {
        name: 'project_members_unique',
        unique: true,
        transaction,
    })
    await queryInterface.addIndex('project_members', ['userId'], { name: 'project_members_user', transaction })

    await queryInterface.createTable(
        'project_member_permissions',
        {
            projectMemberPermissionId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
                autoIncrement: true,
            },
            projectMemberId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'project_members', key: 'projectMemberId' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
            },
            permission: { type: DataTypes.STRING(32), allowNull: false },
            ...timestamps,
        },
        { transaction },
    )
    await queryInterface.addIndex('project_member_permissions', ['projectMemberId', 'permission'], {
        name: 'project_member_permissions_unique',
        unique: true,
        transaction,
    })
}

async function createLegacyMemberTable(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
    await queryInterface.createTable(
        'project_members',
        {
            projectMemberId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, autoIncrement: true },
            projectId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'projects', key: 'projectId' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
            },
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'userId' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
            },
            permission: { type: DataTypes.STRING(16), allowNull: false },
            ...timestamps,
        },
        { transaction },
    )
    await queryInterface.addIndex('project_members', ['projectId', 'userId', 'permission'], {
        name: 'project_members_unique',
        unique: true,
        transaction,
    })
    await queryInterface.addIndex('project_members', ['userId'], { name: 'project_members_user', transaction })
}

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
        await queryInterface.addColumn(
            'roles',
            'scope',
            { type: DataTypes.STRING(16), allowNull: true },
            { transaction },
        )
        await queryInterface.sequelize.query(`UPDATE "roles" SET "scope" = 'global'`, { transaction })
        await queryInterface.changeColumn(
            'roles',
            'scope',
            { type: DataTypes.STRING(16), allowNull: false },
            { transaction },
        )
        await queryInterface.addColumn(
            'roles',
            'description',
            { type: DataTypes.STRING(255), allowNull: true },
            { transaction },
        )
        await queryInterface.removeIndex('roles', 'roles_name_unique', { transaction })
        await queryInterface.addIndex('roles', ['scope', 'name'], {
            name: 'roles_scope_name_unique',
            unique: true,
            transaction,
        })

        for (const [type, description] of Object.entries(GLOBAL_ROLE_DESCRIPTIONS)) {
            await queryInterface.sequelize.query(
                `UPDATE "roles" SET "description" = :description WHERE "type" = :type AND "description" IS NULL`,
                { transaction, replacements: { description, type } },
            )
        }

        const adminRoles = await queryInterface.sequelize.query<{ roleId: number }>(
            `SELECT "roleId" FROM "roles" WHERE "type" = 'admin'`,
            { transaction, type: QueryTypes.SELECT },
        )
        if (adminRoles.length > 0) {
            await queryInterface.bulkInsert(
                'role_permissions',
                adminRoles.flatMap(({ roleId }) =>
                    ROLE_MANAGEMENT_PERMISSIONS.map((permission) => stamped({ roleId, permission })),
                ),
                { transaction },
            )
        }

        const seededRoles: SeededRole[] = []
        for (const role of PROJECT_ROLES) {
            const [rows] = (await queryInterface.sequelize.query(
                `INSERT INTO "roles" ("name", "scope", "type", "description", "createdAt", "updatedAt")
                 VALUES (:name, 'project', 'custom', :description, NOW(), NOW()) RETURNING "roleId"`,
                { transaction, replacements: { name: role.name, description: role.description } },
            )) as [{ roleId: number }[], unknown]
            const roleId = rows[0]!.roleId
            await queryInterface.bulkInsert(
                'role_permissions',
                role.permissions.map((permission) => stamped({ roleId, permission })),
                { transaction },
            )
            seededRoles.push({ roleId, permissions: role.permissions })
        }

        const legacyRows = await queryInterface.sequelize.query<LegacyMemberRow>(
            `SELECT "projectId", "userId", "permission" FROM "project_members" ORDER BY "projectMemberId"`,
            { transaction, type: QueryTypes.SELECT },
        )
        await queryInterface.dropTable('project_members', { transaction })
        await createMemberTables(queryInterface, transaction)

        const grouped = new Map<string, LegacyMemberRow[]>()
        for (const row of legacyRows) {
            const key = `${row.projectId}:${row.userId}`
            grouped.set(key, [...(grouped.get(key) ?? []), row])
        }
        for (const rows of grouped.values()) {
            const { projectId, userId } = rows[0]!
            const effective = expandLegacyPermissions(rows.map((row) => row.permission))
            const role = pickLargestCoveredRole(seededRoles, effective)
            const [inserted] = (await queryInterface.sequelize.query(
                `INSERT INTO "project_members" ("projectId", "userId", "roleId", "createdAt", "updatedAt")
                 VALUES (:projectId, :userId, :roleId, NOW(), NOW()) RETURNING "projectMemberId"`,
                { transaction, replacements: { projectId, userId, roleId: role.roleId } },
            )) as [{ projectMemberId: number }[], unknown]
            const extras = effective.filter((permission) => !role.permissions.includes(permission))
            if (extras.length > 0) {
                await queryInterface.bulkInsert(
                    'project_member_permissions',
                    extras.map((permission) => stamped({ projectMemberId: inserted[0]!.projectMemberId, permission })),
                    { transaction },
                )
            }
        }
    })
}

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
        const members = await queryInterface.sequelize.query<MemberRow>(
            `SELECT "projectMemberId", "projectId", "userId", "roleId" FROM "project_members" ORDER BY "projectMemberId"`,
            { transaction, type: QueryTypes.SELECT },
        )
        const rolePermissions = await queryInterface.sequelize.query<RolePermissionRow>(
            `SELECT "roleId", "permission" FROM "role_permissions"`,
            { transaction, type: QueryTypes.SELECT },
        )
        const memberPermissions = await queryInterface.sequelize.query<MemberPermissionRow>(
            `SELECT "projectMemberId", "permission" FROM "project_member_permissions"`,
            { transaction, type: QueryTypes.SELECT },
        )

        const legacyRows: LegacyMemberRow[] = []
        for (const member of members) {
            const effective = [
                ...rolePermissions.filter((row) => row.roleId === member.roleId).map((row) => row.permission),
                ...memberPermissions
                    .filter((row) => row.projectMemberId === member.projectMemberId)
                    .map((row) => row.permission),
            ]
            for (const permission of collapseToLegacy(effective)) {
                legacyRows.push({ projectId: member.projectId, userId: member.userId, permission })
            }
        }

        await queryInterface.dropTable('project_member_permissions', { transaction })
        await queryInterface.dropTable('project_members', { transaction })
        await createLegacyMemberTable(queryInterface, transaction)
        if (legacyRows.length > 0) {
            await queryInterface.bulkInsert('project_members', legacyRows.map(stamped), { transaction })
        }

        await queryInterface.sequelize.query(`DELETE FROM "roles" WHERE "scope" = 'project'`, { transaction })
        await queryInterface.bulkDelete(
            'role_permissions',
            { permission: ROLE_MANAGEMENT_PERMISSIONS },
            { transaction },
        )
        await queryInterface.bulkDelete(
            'user_permissions',
            { permission: ROLE_MANAGEMENT_PERMISSIONS },
            { transaction },
        )
        await queryInterface.removeIndex('roles', 'roles_scope_name_unique', { transaction })
        await queryInterface.removeColumn('roles', 'description', { transaction })
        await queryInterface.removeColumn('roles', 'scope', { transaction })
        await queryInterface.addIndex('roles', ['name'], { name: 'roles_name_unique', unique: true, transaction })
    })
}
