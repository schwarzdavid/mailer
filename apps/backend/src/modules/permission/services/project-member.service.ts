import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { Op, type Transaction, type WhereOptions } from 'sequelize'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { ProjectMemberPermissionModel } from '../models/project-member-permission.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { UserPermissionModel } from '../models/user-permission.model.js'
import type { FullUser } from '../../user/interfaces/user.interface.js'
import type { ProjectImplicitAccess } from '../../project/interfaces/project.interface.js'
import { PermissionCacheService } from './permission-cache.service.js'
import { RoleService } from './role.service.js'
import { assertProjectPermission, canOnProject } from '../helpers/project-access.js'
import { assertPermissionChangesHeld, assertRoleGrantable } from '../helpers/permission-grants.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { ProjectMemberGrant, ProjectMemberInfo, ProjectMembership } from '../interfaces/project-member.interface.js'
import { RoleWithPermissions } from '../interfaces/role.interface.js'
import { isProjectPermission, Permission, PROJECT_PERMISSIONS, ProjectPermission } from '../permission.constants.js'

const ALL_PROJECTS_PERMISSION: Permission = 'projects.all'

function projectPermissionsOf(role: RoleWithPermissions): ProjectPermission[] {
    return role.permissions.filter(isProjectPermission)
}

@Injectable()
export class ProjectMemberService {
    constructor(
        @InjectModel(ProjectMemberModel) private readonly memberModel: typeof ProjectMemberModel,
        @InjectModel(ProjectMemberPermissionModel)
        private readonly memberPermissionModel: typeof ProjectMemberPermissionModel,
        @InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
        @InjectModel(RolePermissionModel) private readonly rolePermissionModel: typeof RolePermissionModel,
        @InjectModel(UserPermissionModel) private readonly userPermissionModel: typeof UserPermissionModel,
        private readonly roleService: RoleService,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async getMembers(projectId: number, ability: AppAbility): Promise<ProjectMemberInfo[]> {
        await this.assertCanManageMembers(projectId, ability)

        const rows = await this.memberModel.findAll({
            where: { projectId },
            include: [UserModel, RoleModel, ProjectMemberPermissionModel],
            order: [['projectMemberId', 'ASC']],
        })

        return rows.map((row) => ({
            userId: row.userId,
            firstName: row.user!.firstName,
            lastName: row.user!.lastName,
            email: row.user!.email,
            role: { roleId: row.role!.roleId, name: row.role!.name },
            permissions: row.permissions.map((entry) => entry.permission),
        }))
    }

    async getProjectRoles(projectId: number, ability: AppAbility): Promise<RoleWithPermissions[]> {
        await this.assertCanManageMembers(projectId, ability)

        return this.roleService.getProjectRoles()
    }

    async getImplicitAccess(projectId: number, ability: AppAbility): Promise<ProjectImplicitAccess> {
        await this.assertCanManageMembers(projectId, ability)

        const [superAdminCount, allProjectsUserCount] = await Promise.all([
            this.countUsersWithRole({ type: 'super_admin' }),
            this.countNonSuperAdminsWithAllProjects(),
        ])

        return { superAdminCount, allProjectsUserCount }
    }

    async setMember(projectId: number, userId: number, grant: ProjectMemberGrant, ability: AppAbility): Promise<void> {
        await this.assertCanManageMembers(projectId, ability)

        const user = await this.userModel.findByPk(userId)
        if (!user) {
            throw new NotFoundException('Unknown user')
        }

        const role = await this.roleService.findRole(grant.roleId)
        if (!role || role.scope !== 'project') {
            throw new BadRequestException('Unknown project role')
        }

        const isHeld = (permission: ProjectPermission) => canOnProject(ability, permission, projectId)
        const rolePermissions = projectPermissionsOf(role)
        const existing = await this.memberModel.findOne({
            where: { projectId, userId },
            include: [ProjectMemberPermissionModel],
        })
        if (existing?.roleId !== role.roleId) {
            assertRoleGrantable(rolePermissions, isHeld)
        }

        const extras = [...new Set(grant.permissions)].filter((permission) => !rolePermissions.includes(permission))
        const currentExtras = existing?.permissions.map((entry) => entry.permission) ?? []
        assertPermissionChangesHeld(currentExtras, extras, isHeld)

        await this.sequelize.transaction(async (transaction) => {
            await this.memberModel.destroy({ where: { projectId, userId }, transaction })
            await this.createMembership(projectId, userId, role.roleId, extras, transaction)
        })

        await this.permissionCacheService.invalidateUser(userId)
    }

    async removeMember(projectId: number, userId: number, ability: AppAbility): Promise<void> {
        await this.assertCanManageMembers(projectId, ability)

        await this.memberModel.destroy({ where: { projectId, userId } })
        await this.permissionCacheService.invalidateUser(userId)
    }

    async grantFullAccess(projectId: number, userId: number, transaction: Transaction): Promise<void> {
        const roles = await this.roleService.getProjectRoles()
        if (roles.length === 0) {
            throw new BadRequestException('No project role is configured')
        }

        const covering = roles.find((role) =>
            PROJECT_PERMISSIONS.every((permission) => projectPermissionsOf(role).includes(permission)),
        )
        const role =
            covering ??
            roles.reduce((best, candidate) =>
                projectPermissionsOf(candidate).length > projectPermissionsOf(best).length ? candidate : best,
            )
        const extras = PROJECT_PERMISSIONS.filter((permission) => !projectPermissionsOf(role).includes(permission))

        await this.createMembership(projectId, userId, role.roleId, extras, transaction)
    }

    async getMembershipsForUser(userId: number): Promise<ProjectMembership[]> {
        const rows = await this.memberModel.findAll({
            where: { userId },
            include: [{ model: ProjectModel, required: true }, RoleModel, ProjectMemberPermissionModel],
            order: [['projectMemberId', 'ASC']],
        })

        return rows.map((row) => ({
            projectId: row.projectId,
            projectName: row.project!.name,
            role: { roleId: row.role!.roleId, name: row.role!.name },
            permissions: row.permissions.map((entry) => entry.permission),
        }))
    }

    async countMembershipsPerUser(): Promise<Map<number, number>> {
        const rows = await this.memberModel.findAll({
            attributes: ['userId'],
            include: [{ model: ProjectModel, attributes: [], required: true }],
        })

        const counts = new Map<number, number>()
        for (const row of rows) {
            counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
        }

        return counts
    }

    private async createMembership(
        projectId: number,
        userId: number,
        roleId: number,
        extras: ProjectPermission[],
        transaction: Transaction,
    ): Promise<void> {
        const member = await this.memberModel.create({ projectId, userId, roleId }, { returning: true, transaction })
        await this.memberPermissionModel.bulkCreate(
            extras.map((permission) => ({ projectMemberId: member.projectMemberId, permission })),
            { transaction },
        )
    }

    private async countNonSuperAdminsWithAllProjects(): Promise<number> {
        const [rolePermissions, userPermissions] = await Promise.all([
            this.rolePermissionModel.findAll({
                attributes: ['roleId'],
                where: { permission: ALL_PROJECTS_PERMISSION },
            }),
            this.userPermissionModel.findAll({
                attributes: ['userId'],
                where: { permission: ALL_PROJECTS_PERMISSION },
            }),
        ])

        const roleIds = rolePermissions.map((row) => row.roleId)
        const userIds = userPermissions.map((row) => row.userId)
        if (roleIds.length === 0 && userIds.length === 0) {
            return 0
        }

        return this.countUsersWithRole(
            { type: { [Op.ne]: 'super_admin' } },
            { [Op.or]: [{ roleId: { [Op.in]: roleIds } }, { userId: { [Op.in]: userIds } }] },
        )
    }

    private countUsersWithRole(
        roleWhere: WhereOptions<RoleModel>,
        userWhere?: WhereOptions<FullUser>,
    ): Promise<number> {
        return this.userModel.count({
            where: userWhere,
            include: [{ model: RoleModel, attributes: [], where: roleWhere, required: true }],
        })
    }

    private async assertCanManageMembers(projectId: number, ability: AppAbility): Promise<void> {
        const project = await this.projectModel.findByPk(projectId)
        if (!project) {
            throw new NotFoundException('Unknown project')
        }

        if (ability.can('update', 'User')) {
            return
        }

        assertProjectPermission(ability, 'members.manage', projectId)
    }
}
