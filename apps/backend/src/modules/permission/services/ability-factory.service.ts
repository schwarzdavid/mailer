import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { UserPermissionModel } from '../models/user-permission.model.js'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { ProjectMemberPermissionModel } from '../models/project-member-permission.model.js'
import { User } from '../../user/interfaces/user.interface.js'
import {
    AUTH_PERMISSIONS_CACHE_PREFIX,
    GLOBAL_PERMISSION_ABILITIES,
    isGlobalPermission,
    Permission,
    PROJECT_PERMISSIONS,
    ProjectPermission,
    RoleType,
} from '../permission.constants.js'
import { AppAbility } from '../interfaces/app-ability.js'

export interface PermissionInputs {
    roleType: RoleType
    permissions: Permission[]
    memberships: { projectId: number; permissions: ProjectPermission[] }[]
}

function effectiveProjectPermissions(row: ProjectMemberModel): ProjectPermission[] {
    const granted = new Set<string>([
        ...(row.role?.permissions ?? []).map((entry) => entry.permission),
        ...(row.permissions ?? []).map((entry) => entry.permission),
    ])

    return PROJECT_PERMISSIONS.filter((permission) => granted.has(permission))
}

@Injectable()
export class AbilityFactory {
    constructor(
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        @InjectModel(RoleModel) private readonly roleModel: typeof RoleModel,
        @InjectModel(RolePermissionModel) private readonly rolePermissionModel: typeof RolePermissionModel,
        @InjectModel(UserPermissionModel) private readonly userPermissionModel: typeof UserPermissionModel,
        @InjectModel(ProjectMemberModel) private readonly projectMemberModel: typeof ProjectMemberModel,
    ) {}

    async createForUser(user: User): Promise<AppAbility> {
        const inputs = await this.getPermissionInputs(user)
        const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

        if (inputs.roleType === 'super_admin') {
            can('manage', 'all')
            return build()
        }

        for (const permission of inputs.permissions) {
            for (const [action, subjectName] of GLOBAL_PERMISSION_ABILITIES[permission]) {
                can(action, subjectName)
            }
        }

        for (const projectPermission of PROJECT_PERMISSIONS) {
            const projectIds = inputs.memberships
                .filter((membership) => membership.permissions.includes(projectPermission))
                .map((membership) => membership.projectId)

            if (projectIds.length > 0) {
                can(projectPermission, 'Project', { projectId: { $in: projectIds } })
            }
        }

        cannot(['update', 'delete'], 'User', { 'role.type': 'super_admin' })

        return build()
    }

    async hasAllProjectsAccess(user: User): Promise<boolean> {
        const inputs = await this.getPermissionInputs(user)

        return inputs.roleType === 'super_admin' || inputs.permissions.includes('projects.all')
    }

    async getProjectIdsFor(user: User, permission: ProjectPermission): Promise<number[] | 'all'> {
        if (await this.hasAllProjectsAccess(user)) {
            return 'all'
        }

        const inputs = await this.getPermissionInputs(user)

        return inputs.memberships
            .filter((membership) => membership.permissions.includes(permission))
            .map((membership) => membership.projectId)
    }

    async getPermissionInputs(user: User): Promise<PermissionInputs> {
        const cacheKey = AUTH_PERMISSIONS_CACHE_PREFIX + user.userId
        const cached = await this.cacheManager.get<PermissionInputs>(cacheKey)
        if (cached) {
            return cached
        }

        const [role, rolePermissions, userPermissions, memberships] = await Promise.all([
            this.roleModel.findByPk(user.roleId, { rejectOnEmpty: true }),
            this.rolePermissionModel.findAll({ where: { roleId: user.roleId } }),
            this.userPermissionModel.findAll({ where: { userId: user.userId } }),
            this.projectMemberModel.findAll({
                where: { userId: user.userId },
                include: [{ model: RoleModel, include: [RolePermissionModel] }, ProjectMemberPermissionModel],
            }),
        ])

        const permissions = [
            ...new Set([
                ...rolePermissions.map((row) => row.permission).filter(isGlobalPermission),
                ...userPermissions.map((row) => row.permission),
            ]),
        ]

        const inputs: PermissionInputs = {
            roleType: role.type,
            permissions,
            memberships: memberships.map((row) => ({
                projectId: row.projectId,
                permissions: effectiveProjectPermissions(row),
            })),
        }

        void this.cacheManager.set(cacheKey, inputs).catch(() => undefined)

        return inputs
    }
}
