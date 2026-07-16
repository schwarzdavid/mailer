import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Op, UniqueConstraintError } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectService } from './project.service'
import { ProjectModel } from '../models/project.model'
import { ProjectDomainModel } from '../models/project-domain.model'
import { DomainModel } from '../../domain/models/domain.model'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model'
import { DomainService } from '../../domain/services/domain.service'
import { Domain } from '../../domain/interfaces/domain.interface'
import { InboundForm } from '../../inbound-form/interfaces/inbound-form.interface'
import { Project } from '../interfaces/project.interface'

const domain: Domain = {
    domainId: 3,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    activeDkimId: 7,
    dnsRecords: [],
    lastCheckedAt: null,
}

const inboundForm: InboundForm = {
    inboundFormId: 11,
    projectId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const project: Project = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
}

type ProjectPlain = Project & { domains?: Domain[]; inboundForms?: InboundForm[] }

type ProjectRow = ProjectPlain & {
    get: (options: { plain: true }) => ProjectPlain
    update: Mock<(values: Partial<Project>) => Promise<ProjectRow>>
    destroy: Mock<() => Promise<void>>
    restore: Mock<() => Promise<void>>
}

function projectRow(partial: Partial<ProjectPlain> = {}): ProjectRow {
    const plain: ProjectPlain = { ...project, ...partial }
    const row = {
        ...plain,
        get: () => plain,
        update: vi.fn<ProjectRow['update']>(),
        destroy: vi.fn<ProjectRow['destroy']>().mockResolvedValue(undefined),
        restore: vi.fn<ProjectRow['restore']>().mockResolvedValue(undefined),
    }
    row.update.mockResolvedValue(row)
    return row
}

describe('ProjectService', () => {
    let service: ProjectService
    let projectFindAll: Mock<(options?: object) => Promise<ProjectRow[]>>
    let projectFindByPk: Mock<
        (projectId: number, options?: { include?: unknown[]; paranoid?: boolean }) => Promise<ProjectRow | null>
    >
    let projectCreate: Mock<(values: { name: string }, options: { returning: true }) => Promise<ProjectRow>>
    let projectDomainFindOne: Mock<
        (options: { where: { projectId: number; domainId: number } }) => Promise<object | null>
    >
    let projectDomainFindOrCreate: Mock<
        (options: { where: { projectId: number; domainId: number } }) => Promise<[object, boolean]>
    >
    let projectDomainDestroy: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let formCount: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let getDomainById: Mock<DomainService['getDomainById']>

    beforeEach(async () => {
        projectFindAll = vi.fn<typeof projectFindAll>().mockResolvedValue([])
        projectFindByPk = vi.fn<typeof projectFindByPk>()
        projectCreate = vi.fn<typeof projectCreate>()
        projectDomainFindOne = vi.fn<typeof projectDomainFindOne>()
        projectDomainFindOrCreate = vi.fn<typeof projectDomainFindOrCreate>().mockResolvedValue([{}, true])
        projectDomainDestroy = vi.fn<typeof projectDomainDestroy>().mockResolvedValue(0)
        formCount = vi.fn<typeof formCount>().mockResolvedValue(0)
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(domain)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectService,
                {
                    provide: getModelToken(ProjectModel),
                    useValue: { findAll: projectFindAll, findByPk: projectFindByPk, create: projectCreate },
                },
                {
                    provide: getModelToken(ProjectDomainModel),
                    useValue: {
                        findOne: projectDomainFindOne,
                        findOrCreate: projectDomainFindOrCreate,
                        destroy: projectDomainDestroy,
                    },
                },
                { provide: getModelToken(InboundFormModel), useValue: { count: formCount } },
                { provide: DomainService, useValue: { getDomainById } },
            ],
        }).compile()

        service = module.get(ProjectService)
    })

    describe('createProject', () => {
        it('creates the project and returns the plain row', async () => {
            projectCreate.mockResolvedValue(projectRow())

            const created = await service.createProject('Acme')

            expect(projectCreate).toHaveBeenCalledWith({ name: 'Acme' }, { returning: true })
            expect(created).toEqual(project)
        })

        it('maps unique name violations to a bad request', async () => {
            projectCreate.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createProject('Acme')).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })
    })

    describe('getProjects', () => {
        it('returns projects with domain and form counts', async () => {
            projectFindAll.mockResolvedValue([projectRow({ domains: [domain], inboundForms: [inboundForm] })])

            const projects = await service.getProjects()

            expect(projectFindAll).toHaveBeenCalledWith({ include: [DomainModel, InboundFormModel] })
            expect(projects).toEqual([{ ...project, domainCount: 1, inboundFormCount: 1 }])
        })
    })

    describe('getDeletedProjects', () => {
        it('queries trashed rows outside the paranoid scope', async () => {
            const deletedAt = new Date()
            projectFindAll.mockResolvedValue([projectRow({ deletedAt })])

            const projects = await service.getDeletedProjects()

            expect(projectFindAll).toHaveBeenCalledWith({
                paranoid: false,
                where: { deletedAt: { [Op.not]: null } },
            })
            expect(projects).toEqual([{ ...project, deletedAt }])
        })
    })

    describe('getProjectById', () => {
        it('returns the project with its domains', async () => {
            projectFindByPk.mockResolvedValue(projectRow({ domains: [domain] }))

            const loaded = await service.getProjectById(1)

            expect(projectFindByPk).toHaveBeenCalledWith(1, { include: [DomainModel] })
            expect(loaded).toEqual({ ...project, domains: [domain] })
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.getProjectById(1)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })

    describe('updateProject', () => {
        it('renames the project', async () => {
            const row = projectRow()
            projectFindByPk.mockResolvedValue(row)

            await service.updateProject(1, { name: 'Beta' })

            expect(row.update).toHaveBeenCalledWith({ name: 'Beta' })
        })

        it('maps unique name violations to a bad request', async () => {
            const row = projectRow()
            row.update.mockRejectedValue(new UniqueConstraintError({}))
            projectFindByPk.mockResolvedValue(row)

            await expect(service.updateProject(1, { name: 'Beta' })).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.updateProject(1, { name: 'Beta' })).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
        })
    })

    describe('deleteProject', () => {
        it('soft deletes the row', async () => {
            const row = projectRow()
            projectFindByPk.mockResolvedValue(row)

            await service.deleteProject(1)

            expect(row.destroy).toHaveBeenCalledOnce()
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.deleteProject(1)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })

    describe('restoreProject', () => {
        it('restores a trashed project', async () => {
            const row = projectRow({ deletedAt: new Date() })
            projectFindByPk.mockResolvedValue(row)

            await service.restoreProject(1)

            expect(projectFindByPk).toHaveBeenCalledWith(1, { paranoid: false })
            expect(row.restore).toHaveBeenCalledOnce()
        })

        it('throws not found when the project is not trashed', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.restoreProject(1)).rejects.toThrow(new NotFoundException('Unknown project'))
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.restoreProject(1)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })

    describe('assignDomain', () => {
        it('assigns an existing domain idempotently', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await service.assignDomain(1, 3)

            expect(getDomainById).toHaveBeenCalledWith(3)
            expect(projectDomainFindOrCreate).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
        })

        it('rejects unknown domains', async () => {
            projectFindByPk.mockResolvedValue(projectRow())
            getDomainById.mockRejectedValue(new Error('empty result'))

            await expect(service.assignDomain(1, 3)).rejects.toThrow(new BadRequestException('Unknown domain'))
            expect(projectDomainFindOrCreate).not.toHaveBeenCalled()
        })

        it('rejects unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.assignDomain(1, 3)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })

    describe('unassignDomain', () => {
        it('removes the assignment when no form uses the domain', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await service.unassignDomain(1, 3)

            expect(formCount).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
            expect(projectDomainDestroy).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
        })

        it('blocks removal while forms in the project use the domain', async () => {
            projectFindByPk.mockResolvedValue(projectRow())
            formCount.mockResolvedValue(2)

            await expect(service.unassignDomain(1, 3)).rejects.toThrow(
                new BadRequestException('The domain is used by 2 forms in this project'),
            )
            expect(projectDomainDestroy).not.toHaveBeenCalled()
        })
    })

    describe('assertDomainInProject', () => {
        it('resolves when the assignment exists', async () => {
            projectDomainFindOne.mockResolvedValue({})

            await expect(service.assertDomainInProject(1, 3)).resolves.toBeUndefined()

            expect(projectDomainFindOne).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
        })

        it('rejects when the domain is not assigned', async () => {
            projectDomainFindOne.mockResolvedValue(null)

            await expect(service.assertDomainInProject(1, 3)).rejects.toThrow(
                new BadRequestException('Domain does not belong to the project'),
            )
        })
    })
})
