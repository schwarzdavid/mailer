import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectController } from './project.controller'
import { ProjectService } from '../services/project.service'
import { PROJECT_PURGE_AFTER_MS } from '../project.constants'
import { Domain } from '../../domain/interfaces/domain.interface'
import { DeletedProject, Project, ProjectWithCounts, ProjectWithDomains } from '../interfaces/project.interface'

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
            ],
        }).compile()

        controller = module.get(ProjectController)
    })

    it('creates a project', async () => {
        const dto = await controller.createProject({ name: 'Acme' })

        expect(createProject).toHaveBeenCalledWith('Acme')
        expect(dto).toEqual({
            projectId: 1,
            name: 'Acme',
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
        })
    })

    it('lists projects with counts', async () => {
        const dtos = await controller.getProjects()

        expect(dtos).toEqual([expect.objectContaining({ projectId: 1, inboundFormCount: 2, domainCount: 1 })])
    })

    it('lists deleted projects with the purge date', async () => {
        const dtos = await controller.getDeletedProjects()

        expect(dtos).toEqual([
            expect.objectContaining({
                projectId: 1,
                deletedAt: deletedProject.deletedAt,
                purgeAt: new Date(deletedProject.deletedAt.getTime() + PROJECT_PURGE_AFTER_MS),
            }),
        ])
    })

    it('returns the project detail with domains', async () => {
        const dto = await controller.getProject(1)

        expect(getProjectById).toHaveBeenCalledWith(1)
        expect(dto.domains).toEqual([expect.objectContaining({ domainId: 3, fqdn: 'mail.example.com' })])
    })

    it('renames a project', async () => {
        await controller.updateProject(1, { name: 'Beta' })

        expect(updateProject).toHaveBeenCalledWith(1, { name: 'Beta' })
    })

    it('soft deletes a project', async () => {
        await controller.deleteProject(1)

        expect(deleteProject).toHaveBeenCalledWith(1)
    })

    it('restores a project', async () => {
        const dto = await controller.restoreProject(1)

        expect(restoreProject).toHaveBeenCalledWith(1)
        expect(dto).toEqual(expect.objectContaining({ projectId: 1 }))
    })

    it('assigns a domain', async () => {
        await controller.assignProjectDomain(1, { domainId: 3 })

        expect(assignDomain).toHaveBeenCalledWith(1, 3)
    })

    it('unassigns a domain', async () => {
        await controller.unassignProjectDomain(1, 3)

        expect(unassignDomain).toHaveBeenCalledWith(1, 3)
    })
})
