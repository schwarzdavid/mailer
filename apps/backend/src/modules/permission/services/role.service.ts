import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { PermissionCacheService } from './permission-cache.service.js'
import {
    Role,
    RoleCreateInput,
    RoleSummary,
    RoleUpdateInput,
    RoleWithPermissions,
} from '../interfaces/role.interface.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { holdsRolePermission } from '../helpers/holds-permission.js'
import { assertPermissionChangesHeld } from '../helpers/permission-grants.js'
import {
    CatalogPermission,
    permissionsForScope,
    PROJECT_ROLE_REQUIRED_PERMISSION,
    RoleScope,
    RoleType,
} from '../permission.constants.js'

interface RoleRow {
    get(options: { plain: true }): Role & { permissions?: { permission: CatalogPermission }[] }
}

function toRoleWithPermissions(row: RoleRow): RoleWithPermissions {
    const { permissions, ...role } = row.get({ plain: true })

    return { ...role, permissions: (permissions ?? []).map((entry) => entry.permission) }
}

@Injectable()
export class RoleService {
    constructor(
        @InjectModel(RoleModel) private readonly roleModel: typeof RoleModel,
        @InjectModel(RolePermissionModel) private readonly rolePermissionModel: typeof RolePermissionModel,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
        @InjectModel(ProjectMemberModel) private readonly memberModel: typeof ProjectMemberModel,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async getRoles(): Promise<RoleSummary[]> {
        const [rows, userCounts, memberCounts] = await Promise.all([
            this.roleModel.findAll({ include: [RolePermissionModel], order: [['roleId', 'ASC']] }),
            this.userModel.count({ group: ['roleId'] }),
            this.memberModel.count({ group: ['roleId'] }),
        ])
        const countsByRole = (counts: { roleId?: unknown; count: number }[]) =>
            new Map(counts.map((entry) => [Number(entry.roleId), entry.count]))
        const usersPerRole = countsByRole(userCounts)
        const membersPerRole = countsByRole(memberCounts)

        return rows.map((row) => {
            const role = toRoleWithPermissions(row)
            const counts = role.scope === 'global' ? usersPerRole : membersPerRole

            return { ...role, assignmentCount: counts.get(role.roleId) ?? 0 }
        })
    }

    async getRoleById(roleId: number): Promise<RoleSummary> {
        const role = await this.findRole(roleId)
        if (!role) {
            throw new NotFoundException('Unknown role')
        }

        return { ...role, assignmentCount: await this.countAssignments(role) }
    }

    async findRole(roleId: number): Promise<RoleWithPermissions | null> {
        const row = await this.roleModel.findByPk(roleId, { include: [RolePermissionModel] })

        return row ? toRoleWithPermissions(row) : null
    }

    async getRoleByType(type: RoleType): Promise<Role> {
        const row = await this.roleModel.findOne({ where: { type }, rejectOnEmpty: true })

        return row.get({ plain: true })
    }

    async getProjectRoles(): Promise<RoleWithPermissions[]> {
        const rows = await this.roleModel.findAll({
            where: { scope: 'project' },
            include: [RolePermissionModel],
            order: [['roleId', 'ASC']],
        })

        return rows.map((row) => toRoleWithPermissions(row))
    }

    async createRole(input: RoleCreateInput, ability: AppAbility): Promise<RoleSummary> {
        const permissions = this.normalizePermissions(input.scope, input.permissions)
        assertPermissionChangesHeld([], permissions, (permission) =>
            holdsRolePermission(ability, input.scope, permission),
        )

        const roleId = await this.sequelize.transaction(async (transaction) => {
            const created = await this.createRow(
                { name: input.name, scope: input.scope, type: 'custom', description: input.description },
                transaction,
            )
            await this.rolePermissionModel.bulkCreate(
                permissions.map((permission) => ({ roleId: created.roleId, permission })),
                { transaction },
            )

            return created.roleId
        })

        return this.getRoleById(roleId)
    }

    async updateRole(roleId: number, update: RoleUpdateInput, ability: AppAbility): Promise<RoleSummary> {
        const role = await this.getRoleById(roleId)
        this.assertEditable(role)

        const permissions =
            update.permissions === undefined ? undefined : this.normalizePermissions(role.scope, update.permissions)
        if (permissions) {
            assertPermissionChangesHeld(role.permissions, permissions, (permission) =>
                holdsRolePermission(ability, role.scope, permission),
            )
        }

        const changes: Partial<Pick<Role, 'name' | 'description'>> = {}
        if (update.name !== undefined) {
            changes.name = update.name
        }
        if (update.description !== undefined) {
            changes.description = update.description
        }

        await this.sequelize.transaction(async (transaction) => {
            if (Object.keys(changes).length > 0) {
                try {
                    await this.roleModel.update(changes, { where: { roleId }, transaction })
                } catch (error) {
                    if (error instanceof UniqueConstraintError) {
                        throw new BadRequestException('Name is already in use')
                    }
                    throw error
                }
            }
            if (permissions) {
                await this.rolePermissionModel.destroy({ where: { roleId }, transaction })
                await this.rolePermissionModel.bulkCreate(
                    permissions.map((permission) => ({ roleId, permission })),
                    { transaction },
                )
            }
        })

        if (permissions || Object.keys(changes).length > 0) {
            await this.permissionCacheService.invalidateUsers(await this.assignedUserIds(role))
        }

        return this.getRoleById(roleId)
    }

    async deleteRole(roleId: number): Promise<void> {
        const role = await this.getRoleById(roleId)
        this.assertEditable(role)

        if (role.assignmentCount > 0) {
            const holders = role.scope === 'global' ? 'users' : 'project members'
            throw new BadRequestException(`The role is still assigned to ${role.assignmentCount} ${holders}`)
        }

        await this.roleModel.destroy({ where: { roleId } })
    }

    private async createRow(
        values: { name: string; scope: RoleScope; type: RoleType; description: string | null },
        transaction: Transaction,
    ): Promise<{ roleId: number }> {
        try {
            return await this.roleModel.create(values, { returning: true, transaction })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Name is already in use')
            }
            throw error
        }
    }

    private normalizePermissions(scope: RoleScope, permissions: CatalogPermission[]): CatalogPermission[] {
        const allowed = permissionsForScope(scope)
        const unique = new Set(permissions)
        for (const permission of unique) {
            if (!allowed.includes(permission)) {
                throw new BadRequestException(`Permission "${permission}" is not available for ${scope} roles`)
            }
        }
        if (scope === 'project' && !unique.has(PROJECT_ROLE_REQUIRED_PERMISSION)) {
            throw new BadRequestException('Project roles must include the read permission')
        }

        return allowed.filter((permission) => unique.has(permission))
    }

    private assertEditable(role: Role): void {
        if (role.type === 'super_admin') {
            throw new ForbiddenException('The super admin role cannot be changed')
        }
    }

    private countAssignments(role: Role): Promise<number> {
        return role.scope === 'global'
            ? this.userModel.count({ where: { roleId: role.roleId } })
            : this.memberModel.count({ where: { roleId: role.roleId } })
    }

    private async assignedUserIds(role: Role): Promise<number[]> {
        const rows =
            role.scope === 'global'
                ? await this.userModel.findAll({ attributes: ['userId'], where: { roleId: role.roleId } })
                : await this.memberModel.findAll({ attributes: ['userId'], where: { roleId: role.roleId } })

        return [...new Set(rows.map((row) => row.userId))]
    }
}
