import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, type ProjectDto } from 'api'
import { useProjectUpdateMutation } from '../useProjectUpdateMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const project: ProjectDto = {
    projectId: 1,
    name: 'Renamed',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectUpdateMutation', () => {
    it('renames the project and refreshes all project queries', async () => {
        const updateSpy = vi.spyOn(ProjectApi, 'updateProject').mockResolvedValue(project)
        const { result, queryClient, unmount } = withVueQuery(() => useProjectUpdateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        const updated = await result.mutateAsync({ projectId: 1, update: { name: 'Renamed' } })

        expect(updateSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { name: 'Renamed' } })
        expect(updated).toEqual(project)
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        unmount()
    })

    it('does not refresh when the update fails', async () => {
        vi.spyOn(ProjectApi, 'updateProject').mockRejectedValue(new Error('Conflict'))
        const { result, queryClient, unmount } = withVueQuery(() => useProjectUpdateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ projectId: 1, update: { name: 'x' } })).rejects.toThrow('Conflict')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})
