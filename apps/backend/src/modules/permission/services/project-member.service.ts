import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { ProjectMemberModel } from '../models/project-member.model'
import { ProjectModel } from '../../project/models/project.model'
import { UserModel } from '../../user/models/user.model'
import { PermissionCacheService } from './permission-cache.service'
import { assertProjectUpdatable } from '../helpers/project-access'
import { AppAbility } from '../interfaces/app-ability'
import { ProjectMemberInfo, ProjectMembership } from '../interfaces/project-member.interface'
import { ProjectPermission } from '../permission.constants'

@Injectable()
export class ProjectMemberService {
    constructor(
        @InjectModel(ProjectMemberModel) private readonly memberModel: typeof ProjectMemberModel,
        @InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
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
