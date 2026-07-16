import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, UniqueConstraintError } from 'sequelize'
import { ProjectModel } from '../models/project.model'
import { ProjectDomainModel } from '../models/project-domain.model'
import { DomainModel } from '../../domain/models/domain.model'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model'
import { DomainService } from '../../domain/services/domain.service'
import { Domain } from '../../domain/interfaces/domain.interface'
import { InboundForm } from '../../inbound-form/interfaces/inbound-form.interface'
import { DeletedProject, Project, ProjectWithCounts, ProjectWithDomains } from '../interfaces/project.interface'

@Injectable()
export class ProjectService {
    constructor(
        @InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel,
        @InjectModel(ProjectDomainModel) private readonly projectDomainModel: typeof ProjectDomainModel,
        @InjectModel(InboundFormModel) private readonly inboundFormModel: typeof InboundFormModel,
        private readonly domainService: DomainService,
    ) {}

    async createProject(name: string): Promise<Project> {
        try {
            const created = await this.projectModel.create({ name }, { returning: true })
            return created.get({ plain: true })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Name is already in use')
            }
            throw error
        }
    }

    async getProjects(): Promise<ProjectWithCounts[]> {
        const rows = await this.projectModel.findAll({ include: [DomainModel, InboundFormModel] })

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

    async getDeletedProjects(): Promise<DeletedProject[]> {
        const rows = await this.projectModel.findAll({
            paranoid: false,
            where: { deletedAt: { [Op.not]: null } },
        })

        return rows.map((row) => row.get({ plain: true }) as DeletedProject)
    }

    async getProjectById(projectId: number): Promise<ProjectWithDomains> {
        const row = await this.projectModel.findByPk(projectId, { include: [DomainModel] })
        if (!row) {
            throw new NotFoundException('Unknown project')
        }

        return row.get({ plain: true }) as ProjectWithDomains
    }

    async updateProject(projectId: number, update: { name: string }): Promise<Project> {
        const row = await this.loadProject(projectId)

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

    async deleteProject(projectId: number): Promise<void> {
        const row = await this.loadProject(projectId)

        await row.destroy()
    }

    async restoreProject(projectId: number): Promise<Project> {
        const row = await this.projectModel.findByPk(projectId, { paranoid: false })
        if (!row || row.deletedAt === null) {
            throw new NotFoundException('Unknown project')
        }

        await row.restore()

        return row.get({ plain: true })
    }

    async assignDomain(projectId: number, domainId: number): Promise<void> {
        await this.loadProject(projectId)
        await this.assertDomainExists(domainId)
        await this.projectDomainModel.findOrCreate({ where: { projectId, domainId } })
    }

    async unassignDomain(projectId: number, domainId: number): Promise<void> {
        await this.loadProject(projectId)

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
