import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { Op, type WhereOptions } from 'sequelize'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { UserPermissionModel } from '../models/user-permission.model.js'
import type { FullUser } from '../../user/interfaces/user.interface.js'
import type { ProjectImplicitAccess } from '../../project/interfaces/project.interface.js'
import { PermissionCacheService } from './permission-cache.service.js'
import { assertProjectUpdatable } from '../helpers/project-access.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { ProjectMemberInfo, ProjectMembership } from '../interfaces/project-member.interface.js'
import { Permission, ProjectPermission } from '../permission.constants.js'

const ALL_PROJECTS_PERMISSION: Permission = 'projects.all'

@Injectable()
export class ProjectMemberService {
    constructor(
        @InjectModel(ProjectMemberModel) private readonly memberModel: typeof ProjectMemberModel,
        @InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
        @InjectModel(RolePermissionModel) private readonly rolePermissionModel: typeof RolePermissionModel,
        @InjectModel(UserPermissionModel) private readonly userPermissionModel: typeof UserPermissionModel,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async getMembers(projectId: number, ability: AppAbility): Promise<ProjectMemberInfo[]> {
        await this.assertCanManageMembers(projectId, ability)

        const rows = await this.memberModel.findAll({ where: { projectId }, include: [UserModel] })

        const byUser = new Map<number, ProjectMemberInfo>()
        for (const row of rows) {
            const user = row.user!
            const entry = byUser.get(row.userId) ?? {
                userId: row.userId,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                permissions: [],
            }
            entry.permissions.push(row.permission)
            byUser.set(row.userId, entry)
        }

        return [...byUser.values()]
    }

    async getImplicitAccess(projectId: number, ability: AppAbility): Promise<ProjectImplicitAccess> {
        await this.assertCanManageMembers(projectId, ability)

        const [superAdminCount, allProjectsUserCount] = await Promise.all([
            this.countUsersWithRole({ type: 'super_admin' }),
            this.countNonSuperAdminsWithAllProjects(),
        ])

        return { superAdminCount, allProjectsUserCount }
    }

    async setMemberPermissions(
        projectId: number,
        userId: number,
        permissions: ProjectPermission[],
        ability: AppAbility,
    ): Promise<void> {
        await this.assertCanManageMembers(projectId, ability)

        const user = await this.userModel.findByPk(userId)
        if (!user) {
            throw new NotFoundException('Unknown user')
        }

        const uniquePermissions = [...new Set(permissions)]

        await this.sequelize.transaction(async (transaction) => {
            await this.memberModel.destroy({ where: { projectId, userId }, transaction })
            await this.memberModel.bulkCreate(
                uniquePermissions.map((permission) => ({ projectId, userId, permission })),
                { transaction },
            )
        })

        await this.permissionCacheService.invalidateUser(userId)
    }

    async removeMember(projectId: number, userId: number, ability: AppAbility): Promise<void> {
        await this.assertCanManageMembers(projectId, ability)

        await this.memberModel.destroy({ where: { projectId, userId } })
        await this.permissionCacheService.invalidateUser(userId)
    }

    async getMembershipsForUser(userId: number): Promise<ProjectMembership[]> {
        const rows = await this.memberModel.findAll({
            where: { userId },
            include: [{ model: ProjectModel, required: true }],
        })

        const byProject = new Map<number, ProjectMembership>()
        for (const row of rows) {
            const entry = byProject.get(row.projectId) ?? {
                projectId: row.projectId,
                projectName: row.project!.name,
                permissions: [],
            }
            entry.permissions.push(row.permission)
            byProject.set(row.projectId, entry)
        }

        return [...byProject.values()]
    }

    async countMembershipsPerUser(): Promise<Map<number, number>> {
        const rows = await this.memberModel.findAll({
            attributes: ['projectId', 'userId'],
            include: [{ model: ProjectModel, attributes: [], required: true }],
        })

        const projectsByUser = new Map<number, Set<number>>()
        for (const row of rows) {
            const projects = projectsByUser.get(row.userId) ?? new Set<number>()
            projects.add(row.projectId)
            projectsByUser.set(row.userId, projects)
        }

        return new Map([...projectsByUser].map(([userId, projects]) => [userId, projects.size]))
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

        assertProjectUpdatable(ability, projectId)
    }
}
