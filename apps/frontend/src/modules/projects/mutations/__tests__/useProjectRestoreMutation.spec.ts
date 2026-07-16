import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, type ProjectDto } from 'api'
import { useProjectRestoreMutation } from '../useProjectRestoreMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const project: ProjectDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectRestoreMutation', () => {
    it('restores the project and refreshes both lists', async () => {
        const restoreSpy = vi.spyOn(ProjectApi, 'restoreProject').mockResolvedValue(project)
        const { result, queryClient, unmount } = withVueQuery(() => useProjectRestoreMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync(1)

        expect(restoreSpy).toHaveBeenCalledWith({ path: { projectId: 1 } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects.deleted'] })
        unmount()
    })
})
