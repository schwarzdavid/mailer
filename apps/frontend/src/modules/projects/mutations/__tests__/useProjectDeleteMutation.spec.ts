import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, type ProjectDetailDto } from 'api'
import { useProjectDeleteMutation } from '../useProjectDeleteMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const project: ProjectDetailDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectDeleteMutation', () => {
    it('deletes the project, drops its cache and refreshes both project lists', async () => {
        const deleteSpy = vi.spyOn(ProjectApi, 'deleteProject').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useProjectDeleteMutation())
        queryClient.setQueryData(['projects', 1], project)
        queryClient.setQueryData(['projects', 2], { ...project, projectId: 2 })
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync(1)

        expect(deleteSpy).toHaveBeenCalledWith({ path: { projectId: 1 } })
        expect(queryClient.getQueryData(['projects', 1])).toBeUndefined()
        expect(queryClient.getQueryData(['projects', 2])).toEqual({ ...project, projectId: 2 })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects.deleted'] })
        unmount()
    })

    it('keeps the cached project when deletion fails', async () => {
        vi.spyOn(ProjectApi, 'deleteProject').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useProjectDeleteMutation())
        queryClient.setQueryData(['projects', 1], project)

        await expect(result.mutateAsync(1)).rejects.toThrow('Forbidden')

        expect(queryClient.getQueryData(['projects', 1])).toEqual(project)
        unmount()
    })
})
