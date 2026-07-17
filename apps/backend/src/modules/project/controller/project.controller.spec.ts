import { Test, TestingModule } from '@nestjs/testing'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectController } from './project.controller'
import { ProjectService } from '../services/project.service'
import { ProjectMemberService } from '../../permission/services/project-member.service'
import { PoliciesGuard } from '../../permission/guards/policies.guard'
import { PROJECT_PURGE_AFTER_MS } from '../project.constants'
import { Domain } from '../../domain/interfaces/domain.interface'
import { DeletedProject, Project, ProjectWithCounts, ProjectWithDomains } from '../interfaces/project.interface'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { UserWithRole } from '../../user/interfaces/user.interface'

const domain: Domain = {
    domainId: 3,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    activeDkimId: 7,
    dnsRecords: [],
    lastCheckedAt: null,
}

const project: Project = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
}

const projectWithCounts: ProjectWithCounts = { ...project, inboundFormCount: 2, domainCount: 1 }
const projectWithDomains: ProjectWithDomains = { ...project, domains: [domain] }
const deletedProject: DeletedProject = { ...project, deletedAt: new Date('2026-07-01T00:00:00.000Z') }

const principal: UserWithRole = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 3,
    role: { roleId: 3, name: 'User', type: 'user', createdAt: new Date(), updatedAt: new Date() },
    createdAt: new Date(),
    updatedAt: new Date(),
}

const manageAll = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])

describe('ProjectController', () => {
    let controller: ProjectController
    let createProject: Mock<ProjectService['createProject']>
    let getProjects: Mock<ProjectService['getProjects']>
    let getDeletedProjects: Mock<ProjectService['getDeletedProjects']>
    let getProjectById: Mock<ProjectService['getProjectById']>
    let updateProject: Mock<ProjectService['updateProject']>
    let deleteProject: Mock<ProjectService['deleteProject']>
    let restoreProject: Mock<ProjectService['restoreProject']>
    let assignDomain: Mock<ProjectService['assignDomain']>
    let unassignDomain: Mock<ProjectService['unassignDomain']>
    let getMembers: Mock<ProjectMemberService['getMembers']>
    let setMemberPermissions: Mock<ProjectMemberService['setMemberPermissions']>
    let removeMember: Mock<ProjectMemberService['removeMember']>

    beforeEach(async () => {
        createProject = vi.fn<typeof createProject>().mockResolvedValue(project)
        getProjects = vi.fn<typeof getProjects>().mockResolvedValue([projectWithCounts])
        getDeletedProjects = vi.fn<typeof getDeletedProjects>().mockResolvedValue([deletedProject])
        getProjectById = vi.fn<typeof getProjectById>().mockResolvedValue(projectWithDomains)
        updateProject = vi.fn<typeof updateProject>().mockResolvedValue(project)
        deleteProject = vi.fn<typeof deleteProject>().mockResolvedValue(undefined)
        restoreProject = vi.fn<typeof restoreProject>().mockResolvedValue(project)
        assignDomain = vi.fn<typeof assignDomain>().mockResolvedValue(undefined)
        unassignDomain = vi.fn<typeof unassignDomain>().mockResolvedValue(undefined)
        getMembers = vi.fn<typeof getMembers>().mockResolvedValue([])
        setMemberPermissions = vi.fn<typeof setMemberPermissions>().mockResolvedValue(undefined)
        removeMember = vi.fn<typeof removeMember>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ProjectController],
            providers: [
                {
                    provide: ProjectService,
                    useValue: {
                        createProject,
                        getProjects,
                        getDeletedProjects,
                        getProjectById,
                        updateProject,
                        deleteProject,
                        restoreProject,
                        assignDomain,
                        unassignDomain,
                    },
                },
                {
                    provide: ProjectMemberService,
                    useValue: { getMembers, setMemberPermissions, removeMember },
                },
            ],
        })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
            .compile()

        controller = module.get(ProjectController)
    })

    it('creates a project', async () => {
        const dto = await controller.createProject({ name: 'Acme' }, principal)

        expect(createProject).toHaveBeenCalledWith('Acme', principal)
        expect(dto).toEqual({
            projectId: 1,
            name: 'Acme',
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
        })
    })

    it('lists projects with counts', async () => {
        const dtos = await controller.getProjects(principal)

        expect(getProjects).toHaveBeenCalledWith(principal)
        expect(dtos).toEqual([expect.objectContaining({ projectId: 1, inboundFormCount: 2, domainCount: 1 })])
    })

    it('lists deleted projects with the purge date', async () => {
        const dtos = await controller.getDeletedProjects(principal)

        expect(getDeletedProjects).toHaveBeenCalledWith(principal)
        expect(dtos).toEqual([
            expect.objectContaining({
                projectId: 1,
                deletedAt: deletedProject.deletedAt,
                purgeAt: new Date(deletedProject.deletedAt.getTime() + PROJECT_PURGE_AFTER_MS),
            }),
        ])
    })

    it('returns the project detail with domains', async () => {
        const dto = await controller.getProject(1, manageAll)

        expect(getProjectById).toHaveBeenCalledWith(1, manageAll)
        expect(dto.domains).toEqual([expect.objectContaining({ domainId: 3, fqdn: 'mail.example.com' })])
    })

    it('renames a project', async () => {
        await controller.updateProject(1, { name: 'Beta' }, manageAll)

        expect(updateProject).toHaveBeenCalledWith(1, { name: 'Beta' }, manageAll)
    })

    it('soft deletes a project', async () => {
        await controller.deleteProject(1, manageAll)

        expect(deleteProject).toHaveBeenCalledWith(1, manageAll)
    })

    it('restores a project', async () => {
        const dto = await controller.restoreProject(1, manageAll)

        expect(restoreProject).toHaveBeenCalledWith(1, manageAll)
        expect(dto).toEqual(expect.objectContaining({ projectId: 1 }))
    })

    it('assigns a domain', async () => {
        await controller.assignProjectDomain(1, { domainId: 3 }, manageAll)

        expect(assignDomain).toHaveBeenCalledWith(1, 3, manageAll)
    })

    it('unassigns a domain', async () => {
        await controller.unassignProjectDomain(1, 3, manageAll)

        expect(unassignDomain).toHaveBeenCalledWith(1, 3, manageAll)
    })

    it('lists project members', async () => {
        getMembers.mockResolvedValue([
            { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', permissions: ['read'] },
        ])

        await expect(controller.getProjectMembers(1, manageAll)).resolves.toEqual([
            expect.objectContaining({ userId: 2, permissions: ['read'] }),
        ])
        expect(getMembers).toHaveBeenCalledWith(1, manageAll)
    })

    it('sets member permissions', async () => {
        await controller.setProjectMember(1, 2, { permissions: ['read', 'update'] }, manageAll)

        expect(setMemberPermissions).toHaveBeenCalledWith(1, 2, ['read', 'update'], manageAll)
    })

    it('removes a member', async () => {
        await controller.removeProjectMember(1, 2, manageAll)

        expect(removeMember).toHaveBeenCalledWith(1, 2, manageAll)
    })
})
