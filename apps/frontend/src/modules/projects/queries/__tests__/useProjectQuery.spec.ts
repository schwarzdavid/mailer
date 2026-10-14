import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/vue-query'
import { ProjectApi, type DeletedProjectDto, type ProjectDetailDto, type ProjectMemberDto } from 'api'
import { useProjectQuery } from '../useProjectQuery.ts'
import { useProjectMembersQuery } from '../useProjectMembersQuery.ts'
import { useDeletedProjectsQuery } from '../useDeletedProjectsQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const project: ProjectDetailDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [],
}

const members: ProjectMemberDto[] = [
    { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', permissions: ['read'] },
]

const deleted: DeletedProjectDto[] = [
    {
        projectId: 3,
        name: 'Old',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: new Date('2026-06-01T00:00:00.000Z'),
        purgeAt: new Date('2026-07-01T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectQuery', () => {
    it('loads the project detail under its id key', async () => {
        const getSpy = vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useProjectQuery(() => 1)))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(getSpy).toHaveBeenCalledWith({ path: { projectId: 1 } })
        expect(queryClient.getQueryData(['projects', 1])).toEqual(project)
        unmount()
    })

    it('is refreshed by an invalidation of the projects list key', async () => {
        const getSpy = vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useProjectQuery(1)))
        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        await queryClient.invalidateQueries({ queryKey: ['projects'] })

        expect(getSpy).toHaveBeenCalledTimes(2)
        unmount()
    })
})

describe('useProjectMembersQuery', () => {
    it('loads the members nested under the project key', async () => {
        const listSpy = vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useProjectMembersQuery(1)))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledWith({ path: { projectId: 1 } })
        expect(queryClient.getQueryData(['projects', 1, 'members'])).toEqual(members)
        unmount()
    })
})

describe('useDeletedProjectsQuery', () => {
    it('loads the trashed projects under their own key', async () => {
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue(deleted)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useDeletedProjectsQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(queryClient.getQueryData(['projects.deleted'])).toEqual(deleted)
        unmount()
    })
})
