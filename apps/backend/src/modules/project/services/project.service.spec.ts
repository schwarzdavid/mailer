import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { Op, UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectService } from './project.service'
import { ProjectModel } from '../models/project.model'
import { ProjectDomainModel } from '../models/project-domain.model'
import { DomainModel } from '../../domain/models/domain.model'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model'
import { DomainService } from '../../domain/services/domain.service'
import { AbilityFactory } from '../../permission/services/ability-factory.service'
import { PermissionCacheService } from '../../permission/services/permission-cache.service'
import { ProjectMemberModel } from '../../permission/models/project-member.model'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { Domain } from '../../domain/interfaces/domain.interface'
import { InboundForm } from '../../inbound-form/interfaces/inbound-form.interface'
import { Project } from '../interfaces/project.interface'
import { User } from '../../user/interfaces/user.interface'

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

const principal: User = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const manageAll = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const memberAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'read', subject: 'Domain' },
])
const readOnlyAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])
const noDomainEditorAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

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
    let projectCreate: Mock<(values: { name: string }, options: object) => Promise<ProjectRow>>
    let projectDomainFindOne: Mock<
        (options: { where: { projectId: number; domainId: number } }) => Promise<object | null>
    >
    let projectDomainFindOrCreate: Mock<
        (options: { where: { projectId: number; domainId: number } }) => Promise<[object, boolean]>
    >
    let projectDomainDestroy: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let formCount: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let getDomainById: Mock<DomainService['getDomainById']>
    let memberBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let hasAllProjectsAccess: Mock<AbilityFactory['hasAllProjectsAccess']>
    let getProjectIdsFor: Mock<AbilityFactory['getProjectIdsFor']>
    let invalidateUser: Mock<PermissionCacheService['invalidateUser']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        projectFindAll = vi.fn<typeof projectFindAll>().mockResolvedValue([])
        projectFindByPk = vi.fn<typeof projectFindByPk>()
        projectCreate = vi.fn<typeof projectCreate>()
        projectDomainFindOne = vi.fn<typeof projectDomainFindOne>()
        projectDomainFindOrCreate = vi.fn<typeof projectDomainFindOrCreate>().mockResolvedValue([{}, true])
        projectDomainDestroy = vi.fn<typeof projectDomainDestroy>().mockResolvedValue(0)
        formCount = vi.fn<typeof formCount>().mockResolvedValue(0)
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(domain)
        memberBulkCreate = vi.fn<typeof memberBulkCreate>().mockResolvedValue([])
        hasAllProjectsAccess = vi.fn<typeof hasAllProjectsAccess>().mockResolvedValue(false)
        getProjectIdsFor = vi.fn<typeof getProjectIdsFor>().mockResolvedValue([1])
        invalidateUser = vi.fn<typeof invalidateUser>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

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
                { provide: getModelToken(ProjectMemberModel), useValue: { bulkCreate: memberBulkCreate } },
                { provide: DomainService, useValue: { getDomainById } },
                { provide: AbilityFactory, useValue: { hasAllProjectsAccess, getProjectIdsFor } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(ProjectService)
    })

    describe('createProject', () => {
        it('grants the creator a full membership when they lack all-projects access', async () => {
            projectCreate.mockResolvedValue(projectRow())

            const created = await service.createProject('Acme', principal)

            expect(projectCreate).toHaveBeenCalledWith(
                { name: 'Acme' },
                { returning: true, transaction: transactionStub },
            )
            expect(memberBulkCreate).toHaveBeenCalledWith(
                [
                    { projectId: 1, userId: 5, permission: 'read' },
                    { projectId: 1, userId: 5, permission: 'update' },
                    { projectId: 1, userId: 5, permission: 'delete' },
                ],
                { transaction: transactionStub },
            )
            expect(invalidateUser).toHaveBeenCalledWith(5)
            expect(created).toEqual(project)
        })

        it('skips the membership for holders of all-projects access', async () => {
            hasAllProjectsAccess.mockResolvedValue(true)
            projectCreate.mockResolvedValue(projectRow())

            await service.createProject('Acme', principal)

            expect(memberBulkCreate).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('maps unique name violations to a bad request', async () => {
            projectCreate.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createProject('Acme', principal)).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })
    })

    describe('getProjects', () => {
        it('applies no filter for all-projects access', async () => {
            getProjectIdsFor.mockResolvedValue('all')
            projectFindAll.mockResolvedValue([projectRow({ domains: [domain], inboundForms: [inboundForm] })])

            const projects = await service.getProjects(principal)

            expect(getProjectIdsFor).toHaveBeenCalledWith(principal, 'read')
            expect(projectFindAll).toHaveBeenCalledWith({ where: undefined, include: [DomainModel, InboundFormModel] })
            expect(projects).toEqual([{ ...project, domainCount: 1, inboundFormCount: 1 }])
        })

        it('filters by readable membership ids otherwise', async () => {
            getProjectIdsFor.mockResolvedValue([1, 4])

            await service.getProjects(principal)

            expect(projectFindAll).toHaveBeenCalledWith({
                where: { projectId: { [Op.in]: [1, 4] } },
                include: [DomainModel, InboundFormModel],
            })
        })
    })

    describe('getDeletedProjects', () => {
        it('scopes trashed rows by the delete level', async () => {
            getProjectIdsFor.mockResolvedValue([1])
            const deletedAt = new Date()
            projectFindAll.mockResolvedValue([projectRow({ deletedAt })])

            const projects = await service.getDeletedProjects(principal)

            expect(getProjectIdsFor).toHaveBeenCalledWith(principal, 'delete')
            expect(projectFindAll).toHaveBeenCalledWith({
                paranoid: false,
                where: { deletedAt: { [Op.not]: null }, projectId: { [Op.in]: [1] } },
            })
            expect(projects).toEqual([{ ...project, deletedAt }])
        })

        it('lists all trashed rows for all-projects access', async () => {
            getProjectIdsFor.mockResolvedValue('all')

            await service.getDeletedProjects(principal)

            expect(projectFindAll).toHaveBeenCalledWith({
                paranoid: false,
                where: { deletedAt: { [Op.not]: null } },
            })
        })
    })

    describe('getProjectById', () => {
        it('returns readable projects with their domains', async () => {
            projectFindByPk.mockResolvedValue(projectRow({ domains: [domain] }))

            const loaded = await service.getProjectById(1, memberAbility)

            expect(projectFindByPk).toHaveBeenCalledWith(1, { include: [DomainModel] })
            expect(loaded).toEqual({ ...project, domains: [domain] })
        })

        it('hides unreadable projects behind a 404', async () => {
            projectFindByPk.mockResolvedValue(projectRow({ projectId: 2, domains: [] }))

            await expect(service.getProjectById(2, memberAbility)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.getProjectById(1, manageAll)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })

    describe('updateProject', () => {
        it('renames updatable projects', async () => {
            const row = projectRow()
            projectFindByPk.mockResolvedValue(row)

            await service.updateProject(1, { name: 'Beta' }, memberAbility)

            expect(row.update).toHaveBeenCalledWith({ name: 'Beta' })
        })

        it('rejects read-only members with a 403', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.updateProject(1, { name: 'Beta' }, readOnlyAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('maps unique name violations to a bad request', async () => {
            const row = projectRow()
            row.update.mockRejectedValue(new UniqueConstraintError({}))
            projectFindByPk.mockResolvedValue(row)

            await expect(service.updateProject(1, { name: 'Beta' }, manageAll)).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })
    })

    describe('deleteProject', () => {
        it('soft deletes with the delete level', async () => {
            const row = projectRow()
            projectFindByPk.mockResolvedValue(row)

            await service.deleteProject(1, manageAll)

            expect(row.destroy).toHaveBeenCalledOnce()
        })

        it('rejects members without the delete level', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.deleteProject(1, memberAbility)).rejects.toThrow(ForbiddenException)
        })
    })

    describe('restoreProject', () => {
        it('restores a trashed project with the delete level', async () => {
            const row = projectRow({ deletedAt: new Date() })
            projectFindByPk.mockResolvedValue(row)

            await service.restoreProject(1, manageAll)

            expect(projectFindByPk).toHaveBeenCalledWith(1, { paranoid: false })
            expect(row.restore).toHaveBeenCalledOnce()
        })

        it('throws not found when the project is not trashed', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.restoreProject(1, manageAll)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })

    describe('assignDomain', () => {
        it('assigns for editors with domain read access', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await service.assignDomain(1, 3, memberAbility)

            expect(getDomainById).toHaveBeenCalledWith(3)
            expect(projectDomainFindOrCreate).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
        })

        it('rejects editors without domain read access', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.assignDomain(1, 3, noDomainEditorAbility)).rejects.toThrow(
                new ForbiddenException('Missing domain permission'),
            )
            expect(projectDomainFindOrCreate).not.toHaveBeenCalled()
        })

        it('rejects unknown domains', async () => {
            projectFindByPk.mockResolvedValue(projectRow())
            getDomainById.mockRejectedValue(new Error('empty result'))

            await expect(service.assignDomain(1, 3, manageAll)).rejects.toThrow(
                new BadRequestException('Unknown domain'),
            )
        })
    })

    describe('unassignDomain', () => {
        it('removes the assignment when no form uses the domain', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await service.unassignDomain(1, 3, memberAbility)

            expect(formCount).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
            expect(projectDomainDestroy).toHaveBeenCalledWith({ where: { projectId: 1, domainId: 3 } })
        })

        it('blocks removal while forms in the project use the domain', async () => {
            projectFindByPk.mockResolvedValue(projectRow())
            formCount.mockResolvedValue(2)

            await expect(service.unassignDomain(1, 3, manageAll)).rejects.toThrow(
                new BadRequestException('The domain is used by 2 forms in this project'),
            )
        })
    })

    describe('assertDomainInProject', () => {
        it('resolves when the assignment exists', async () => {
            projectDomainFindOne.mockResolvedValue({})

            await expect(service.assertDomainInProject(1, 3)).resolves.toBeUndefined()
        })

        it('rejects when the domain is not assigned', async () => {
            projectDomainFindOne.mockResolvedValue(null)

            await expect(service.assertDomainInProject(1, 3)).rejects.toThrow(
                new BadRequestException('Domain does not belong to the project'),
            )
        })
    })
})
