import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, type ProjectListDto } from 'api'
import { useQuery } from '@tanstack/vue-query'
import { useProjectsQuery } from '../useProjectsQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const project: ProjectListDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    inboundFormCount: 2,
    domainCount: 1,
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectsQuery', () => {
    it('loads the projects and exposes them under the projects key', async () => {
        const listSpy = vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue([project])
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useProjectsQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledOnce()
        expect(result.data.value).toEqual([project])
        expect(queryClient.getQueryData(['projects'])).toEqual([project])
        unmount()
    })
})
