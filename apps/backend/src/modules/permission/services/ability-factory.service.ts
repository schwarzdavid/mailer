import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { RoleModel } from '../models/role.model'
import { RolePermissionModel } from '../models/role-permission.model'
import { UserPermissionModel } from '../models/user-permission.model'
import { ProjectMemberModel } from '../models/project-member.model'
import { User } from '../../user/interfaces/user.interface'
import {
    AUTH_PERMISSIONS_CACHE_PREFIX,
    GLOBAL_PERMISSION_ABILITIES,
    Permission,
    PROJECT_PERMISSIONS,
    ProjectPermission,
    RoleType,
} from '../permission.constants'
import { AppAbility } from '../interfaces/app-ability'

export interface PermissionInputs {
    roleType: RoleType
    permissions: Permission[]
    memberships: { projectId: number; permission: ProjectPermission }[]
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
                .filter((membership) => membership.permission === projectPermission)
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
            .filter((membership) => membership.permission === permission)
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
            this.projectMemberModel.findAll({ where: { userId: user.userId } }),
        ])

        const permissions = [
            ...new Set([
                ...rolePermissions.map((row) => row.permission),
                ...userPermissions.map((row) => row.permission),
            ]),
        ]

        const inputs: PermissionInputs = {
            roleType: role.type,
            permissions,
            memberships: memberships.map((row) => ({ projectId: row.projectId, permission: row.permission })),
        }

        void this.cacheManager.set(cacheKey, inputs).catch(() => undefined)

        return inputs
    }
}
