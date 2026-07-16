import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, type ProjectDto } from 'api'
import { useProjectCreateMutation } from '../useProjectCreateMutation.ts'
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

describe('useProjectCreateMutation', () => {
    it('creates the project and invalidates the list', async () => {
        const createSpy = vi.spyOn(ProjectApi, 'createProject').mockResolvedValue(project)
        const { result, queryClient, unmount } = withVueQuery(() => useProjectCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        const created = await result.mutateAsync({ name: 'Acme' })

        expect(createSpy).toHaveBeenCalledWith({ body: { name: 'Acme' } })
        expect(created).toEqual(project)
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        unmount()
    })
})
