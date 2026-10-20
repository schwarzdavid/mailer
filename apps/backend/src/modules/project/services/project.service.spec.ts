import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { Op, UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectService } from './project.service.js'
import { ProjectModel } from '../models/project.model.js'
import { ProjectDomainModel } from '../models/project-domain.model.js'
import { DomainModel } from '../../domain/models/domain.model.js'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { AbilityFactory } from '../../permission/services/ability-factory.service.js'
import { PermissionCacheService } from '../../permission/services/permission-cache.service.js'
import { ProjectMemberService } from '../../permission/services/project-member.service.js'
import { ProjectMemberModel } from '../../permission/models/project-member.model.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { Domain } from '../../domain/interfaces/domain.interface.js'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../../domain/interfaces/domain-dns.interface.js'
import { ProjectMember } from '../../permission/interfaces/project-member.interface.js'
import { InboundForm } from '../../inbound-form/interfaces/inbound-form.interface.js'
import { Project } from '../interfaces/project.interface.js'
import { User } from '../../user/interfaces/user.interface.js'

const domain: Domain = {
    domainId: 3,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    activeDkimId: 7,
    dnsRecords: [],
    lastCheckedAt: null,
}

const validSpf: DomainDnsRecord = {
    dnsId: 51,
    domainId: 3,
    type: DomainDnsRecordType.TXT,
    use: DomainDnsRecordUse.SPF,
    status: DomainDnsRecordStatus.VALID,
    host: 'mail.example.com',
    value: 'v=spf1 include:mail.sending.example ~all',
    current: 'v=spf1 include:mail.sending.example ~all',
    createdAt: new Date(),
    updatedAt: new Date(),
}

const invalidDkim: DomainDnsRecord = {
    ...validSpf,
    dnsId: 52,
    use: DomainDnsRecordUse.DKIM,
    status: DomainDnsRecordStatus.INVALID,
    host: 'mail._domainkey.mail.example.com',
    value: 'v=DKIM1; k=rsa; p=abc',
    current: null,
}

const inboundForm: InboundForm = {
    inboundFormId: 11,
    projectId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    allowedHostnames: [],
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
    let projectDomainCount: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let projectDomainDestroy: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let formCount: Mock<(options: { where: { projectId: number; domainId: number } }) => Promise<number>>
    let getDomainById: Mock<DomainService['getDomainById']>
    let grantFullAccess: Mock<ProjectMemberService['grantFullAccess']>
    let memberFindAll: Mock<(options: object) => Promise<Pick<ProjectMember, 'projectId' | 'userId'>[]>>
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
        projectDomainCount = vi.fn<typeof projectDomainCount>().mockResolvedValue(0)
        projectDomainDestroy = vi.fn<typeof projectDomainDestroy>().mockResolvedValue(0)
        formCount = vi.fn<typeof formCount>().mockResolvedValue(0)
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(domain)
        grantFullAccess = vi.fn<typeof grantFullAccess>().mockResolvedValue(undefined)
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])
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
                        count: projectDomainCount,
                    },
                },
                { provide: getModelToken(InboundFormModel), useValue: { count: formCount } },
                {
                    provide: getModelToken(ProjectMemberModel),
                    useValue: { findAll: memberFindAll },
                },
                { provide: DomainService, useValue: { getDomainById } },
                { provide: ProjectMemberService, useValue: { grantFullAccess } },
                { provide: AbilityFactory, useValue: { hasAllProjectsAccess, getProjectIdsFor } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(ProjectService)
    })

    describe('createProject', () => {
        it('grants the creator full access when they lack all-projects access', async () => {
            projectCreate.mockResolvedValue(projectRow())

            const created = await service.createProject('Acme', principal)

            expect(projectCreate).toHaveBeenCalledWith(
                { name: 'Acme' },
                { returning: true, transaction: transactionStub },
            )
            expect(grantFullAccess).toHaveBeenCalledWith(1, 5, transactionStub)
            expect(invalidateUser).toHaveBeenCalledWith(5)
            expect(created).toEqual(project)
        })

        it('skips the membership for holders of all-projects access', async () => {
            hasAllProjectsAccess.mockResolvedValue(true)
            projectCreate.mockResolvedValue(projectRow())

            await service.createProject('Acme', principal)

            expect(grantFullAccess).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('maps unique name violations to a bad request', async () => {
            projectCreate.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createProject('Acme', principal)).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })

        it('rethrows unexpected persistence errors without touching memberships or the cache', async () => {
            projectCreate.mockRejectedValue(new Error('connection lost'))

            await expect(service.createProject('Acme', principal)).rejects.toThrow('connection lost')
            expect(grantFullAccess).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('does not invalidate the permission cache when granting the membership fails', async () => {
            projectCreate.mockResolvedValue(projectRow())
            grantFullAccess.mockRejectedValue(new Error('constraint violated'))

            await expect(service.createProject('Acme', principal)).rejects.toThrow('constraint violated')
            expect(invalidateUser).not.toHaveBeenCalled()
        })
    })

    describe('getProjects', () => {
        it('applies no filter for all-projects access', async () => {
            getProjectIdsFor.mockResolvedValue('all')
            projectFindAll.mockResolvedValue([projectRow({ domains: [domain], inboundForms: [inboundForm] })])

            const projects = await service.getProjects(principal)

            expect(getProjectIdsFor).toHaveBeenCalledWith(principal, 'read')
            expect(projectFindAll).toHaveBeenCalledWith({ where: undefined, include: [DomainModel, InboundFormModel] })
            expect(projects).toEqual([
                { ...project, domainCount: 1, inboundFormCount: 1, memberCount: 0, domainsHealthy: true },
            ])
        })

        it('counts distinct members per project in one query', async () => {
            getProjectIdsFor.mockResolvedValue('all')
            projectFindAll.mockResolvedValue([
                projectRow({ domains: [], inboundForms: [] }),
                projectRow({ projectId: 2, name: 'Beta', domains: [], inboundForms: [] }),
            ])
            memberFindAll.mockResolvedValue([
                { projectId: 1, userId: 5 },
                { projectId: 1, userId: 5 },
                { projectId: 1, userId: 6 },
            ])

            const projects = await service.getProjects(principal)

            expect(memberFindAll).toHaveBeenCalledWith({
                attributes: ['projectId', 'userId'],
                where: { projectId: { [Op.in]: [1, 2] } },
            })
            expect(projects.map((entry) => entry.memberCount)).toEqual([2, 0])
        })

        it('skips the member query without visible projects', async () => {
            getProjectIdsFor.mockResolvedValue([])

            await expect(service.getProjects(principal)).resolves.toEqual([])
            expect(memberFindAll).not.toHaveBeenCalled()
        })

        it('reports domains as healthy when the project has no domains', async () => {
            projectFindAll.mockResolvedValue([projectRow({ domains: [], inboundForms: [] })])

            const [listed] = await service.getProjects(principal)

            expect(listed?.domainsHealthy).toBe(true)
        })

        it('reports domains as healthy when every record of every domain is valid', async () => {
            projectFindAll.mockResolvedValue([
                projectRow({
                    domains: [
                        { ...domain, dnsRecords: [validSpf] },
                        { ...domain, domainId: 4, dnsRecords: [{ ...validSpf, dnsId: 53, domainId: 4 }] },
                    ],
                    inboundForms: [],
                }),
            ])

            const [listed] = await service.getProjects(principal)

            expect(listed?.domainsHealthy).toBe(true)
        })

        it('reports domains as unhealthy when any domain has an invalid record', async () => {
            projectFindAll.mockResolvedValue([
                projectRow({
                    domains: [
                        { ...domain, dnsRecords: [validSpf] },
                        { ...domain, domainId: 4, dnsRecords: [validSpf, invalidDkim] },
                    ],
                    inboundForms: [],
                }),
            ])

            const [listed] = await service.getProjects(principal)

            expect(listed?.domainsHealthy).toBe(false)
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

        it('rethrows unexpected persistence errors', async () => {
            const row = projectRow()
            row.update.mockRejectedValue(new Error('connection lost'))
            projectFindByPk.mockResolvedValue(row)

            await expect(service.updateProject(1, { name: 'Beta' }, manageAll)).rejects.toThrow('connection lost')
        })

        it('hides projects the caller cannot read behind a 404', async () => {
            const row = projectRow({ projectId: 2 })
            projectFindByPk.mockResolvedValue(row)

            await expect(service.updateProject(2, { name: 'Beta' }, memberAbility)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
            expect(row.update).not.toHaveBeenCalled()
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.updateProject(1, { name: 'Beta' }, manageAll)).rejects.toThrow(
                new NotFoundException('Unknown project'),
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

        it('hides projects the caller cannot read behind a 404 and keeps them', async () => {
            const row = projectRow({ projectId: 2 })
            projectFindByPk.mockResolvedValue(row)

            await expect(service.deleteProject(2, memberAbility)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
            expect(row.destroy).not.toHaveBeenCalled()
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.deleteProject(1, manageAll)).rejects.toThrow(new NotFoundException('Unknown project'))
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

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.restoreProject(1, manageAll)).rejects.toThrow(new NotFoundException('Unknown project'))
        })

        it('rejects members without the delete level and keeps the project trashed', async () => {
            const row = projectRow({ deletedAt: new Date() })
            projectFindByPk.mockResolvedValue(row)

            await expect(service.restoreProject(1, memberAbility)).rejects.toThrow(ForbiddenException)
            expect(row.restore).not.toHaveBeenCalled()
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

        it('rejects read-only members before looking up the domain', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.assignDomain(1, 3, readOnlyAbility)).rejects.toThrow(
                new ForbiddenException('Missing project permission'),
            )
            expect(getDomainById).not.toHaveBeenCalled()
            expect(projectDomainFindOrCreate).not.toHaveBeenCalled()
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.assignDomain(1, 3, manageAll)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
            expect(projectDomainFindOrCreate).not.toHaveBeenCalled()
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

        it('rejects editors without domain read access', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.unassignDomain(1, 3, noDomainEditorAbility)).rejects.toThrow(
                new ForbiddenException('Missing domain permission'),
            )
            expect(projectDomainDestroy).not.toHaveBeenCalled()
        })

        it('rejects read-only members', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.unassignDomain(1, 3, readOnlyAbility)).rejects.toThrow(ForbiddenException)
            expect(projectDomainDestroy).not.toHaveBeenCalled()
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

    describe('hasDomain', () => {
        it('is true when the domain is assigned to the project', async () => {
            projectDomainCount.mockResolvedValue(1)

            await expect(service.hasDomain(3, 8)).resolves.toBe(true)
            expect(projectDomainCount).toHaveBeenCalledWith({ where: { projectId: 3, domainId: 8 } })
        })

        it('is false otherwise', async () => {
            projectDomainCount.mockResolvedValue(0)

            await expect(service.hasDomain(3, 8)).resolves.toBe(false)
        })
    })

    describe('assertProjectExists', () => {
        it('resolves for existing projects', async () => {
            projectFindByPk.mockResolvedValue(projectRow())

            await expect(service.assertProjectExists(1)).resolves.toBeUndefined()
        })

        it('throws not found for unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.assertProjectExists(1)).rejects.toThrow(new NotFoundException('Unknown project'))
        })
    })
})
