import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { Op, UniqueConstraintError } from 'sequelize'
import { ProjectModel } from '../models/project.model'
import { ProjectDomainModel } from '../models/project-domain.model'
import { DomainModel } from '../../domain/models/domain.model'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model'
import { DomainService } from '../../domain/services/domain.service'
import { AbilityFactory } from '../../permission/services/ability-factory.service'
import { PermissionCacheService } from '../../permission/services/permission-cache.service'
import { ProjectMemberModel } from '../../permission/models/project-member.model'
import {
    assertProjectDeletable,
    assertProjectReadable,
    assertProjectUpdatable,
} from '../../permission/helpers/project-access'
import { PROJECT_PERMISSIONS } from '../../permission/permission.constants'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { User } from '../../user/interfaces/user.interface'
import { Domain } from '../../domain/interfaces/domain.interface'
import { InboundForm } from '../../inbound-form/interfaces/inbound-form.interface'
import { DeletedProject, Project, ProjectWithCounts, ProjectWithDomains } from '../interfaces/project.interface'

@Injectable()
export class ProjectService {
    constructor(
        @InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel,
        @InjectModel(ProjectDomainModel) private readonly projectDomainModel: typeof ProjectDomainModel,
        @InjectModel(InboundFormModel) private readonly inboundFormModel: typeof InboundFormModel,
        @InjectModel(ProjectMemberModel) private readonly projectMemberModel: typeof ProjectMemberModel,
        private readonly domainService: DomainService,
        private readonly abilityFactory: AbilityFactory,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async createProject(name: string, principal: User): Promise<Project> {
        const hasAllProjects = await this.abilityFactory.hasAllProjectsAccess(principal)

        const created = await this.sequelize.transaction(async (transaction) => {
            let row: ProjectModel
            try {
                row = await this.projectModel.create({ name }, { returning: true, transaction })
            } catch (error) {
                if (error instanceof UniqueConstraintError) {
                    throw new BadRequestException('Name is already in use')
                }
                throw error
            }

            if (!hasAllProjects) {
                await this.projectMemberModel.bulkCreate(
                    PROJECT_PERMISSIONS.map((permission) => ({
                        projectId: row.projectId,
                        userId: principal.userId,
                        permission,
                    })),
                    { transaction },
                )
            }

            return row.get({ plain: true })
        })

        if (!hasAllProjects) {
            await this.permissionCacheService.invalidateUser(principal.userId)
        }

        return created
    }

    async getProjects(principal: User): Promise<ProjectWithCounts[]> {
        const scope = await this.abilityFactory.getProjectIdsFor(principal, 'read')
        const where = scope === 'all' ? undefined : { projectId: { [Op.in]: scope } }

        const rows = await this.projectModel.findAll({ where, include: [DomainModel, InboundFormModel] })

        return rows.map((row) => {
            const plain = row.get({ plain: true }) as Project & { domains: Domain[]; inboundForms: InboundForm[] }
            const { domains, inboundForms, ...projectFields } = plain

            return {
                ...projectFields,
                inboundFormCount: inboundForms.length,
                domainCount: domains.length,
            }
        })
    }

    async getDeletedProjects(principal: User): Promise<DeletedProject[]> {
        const scope = await this.abilityFactory.getProjectIdsFor(principal, 'delete')
        const where =
            scope === 'all'
                ? { deletedAt: { [Op.not]: null } }
                : { deletedAt: { [Op.not]: null }, projectId: { [Op.in]: scope } }

        const rows = await this.projectModel.findAll({ paranoid: false, where })

        return rows.map((row) => row.get({ plain: true }) as DeletedProject)
    }

    async getProjectById(projectId: number, ability: AppAbility): Promise<ProjectWithDomains> {
        const row = await this.projectModel.findByPk(projectId, { include: [DomainModel] })
        if (!row) {
            throw new NotFoundException('Unknown project')
        }

        assertProjectReadable(ability, projectId)

        return row.get({ plain: true }) as ProjectWithDomains
    }

    async updateProject(projectId: number, update: { name: string }, ability: AppAbility): Promise<Project> {
        const row = await this.loadProject(projectId)
        assertProjectUpdatable(ability, projectId)

        try {
            await row.update(update)
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Name is already in use')
            }
            throw error
        }

        return row.get({ plain: true })
    }

    async deleteProject(projectId: number, ability: AppAbility): Promise<void> {
        const row = await this.loadProject(projectId)
        assertProjectDeletable(ability, projectId)

        await row.destroy()
    }

    async restoreProject(projectId: number, ability: AppAbility): Promise<Project> {
        const row = await this.projectModel.findByPk(projectId, { paranoid: false })
        if (!row || row.deletedAt === null) {
            throw new NotFoundException('Unknown project')
        }

        assertProjectDeletable(ability, projectId)

        await row.restore()

        return row.get({ plain: true })
    }

    async assignDomain(projectId: number, domainId: number, ability: AppAbility): Promise<void> {
        await this.loadProject(projectId)
        assertProjectUpdatable(ability, projectId)
        this.assertCanReadDomains(ability)
        await this.assertDomainExists(domainId)
        await this.projectDomainModel.findOrCreate({ where: { projectId, domainId } })
    }

    async unassignDomain(projectId: number, domainId: number, ability: AppAbility): Promise<void> {
        await this.loadProject(projectId)
        assertProjectUpdatable(ability, projectId)
        this.assertCanReadDomains(ability)

        const count = await this.inboundFormModel.count({ where: { projectId, domainId } })
        if (count > 0) {
            throw new BadRequestException(`The domain is used by ${count} forms in this project`)
        }

        await this.projectDomainModel.destroy({ where: { projectId, domainId } })
    }

    async assertDomainInProject(projectId: number, domainId: number): Promise<void> {
        const assignment = await this.projectDomainModel.findOne({ where: { projectId, domainId } })
        if (!assignment) {
            throw new BadRequestException('Domain does not belong to the project')
        }
    }

    async assertProjectExists(projectId: number): Promise<void> {
        await this.loadProject(projectId)
    }

    private assertCanReadDomains(ability: AppAbility): void {
        if (!ability.can('read', 'Domain')) {
            throw new ForbiddenException('Missing domain permission')
        }
    }

    private async assertDomainExists(domainId: number): Promise<void> {
        try {
            await this.domainService.getDomainById(domainId)
        } catch {
            throw new BadRequestException('Unknown domain')
        }
    }

    private async loadProject(projectId: number): Promise<ProjectModel> {
        const row = await this.projectModel.findByPk(projectId)
        if (!row) {
            throw new NotFoundException('Unknown project')
        }

        return row
    }
}
