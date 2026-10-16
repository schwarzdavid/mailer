import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi } from 'api'
import { useProjectMemberSetMutation } from '../useProjectMemberSetMutation.ts'
import { useProjectMemberRemoveMutation } from '../useProjectMemberRemoveMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectMemberSetMutation', () => {
    it('stores the member permissions and refreshes members and users', async () => {
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useProjectMemberSetMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ projectId: 1, userId: 2, roleId: 7, permissions: ['delete'] })

        expect(setSpy).toHaveBeenCalledWith({
            path: { projectId: 1, userId: 2 },
            body: { roleId: 7, permissions: ['delete'] },
        })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 1, 'members'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
        unmount()
    })

    it('does not refresh when saving fails', async () => {
        vi.spyOn(ProjectApi, 'setProjectMember').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useProjectMemberSetMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ projectId: 1, userId: 2, roleId: 7, permissions: [] })).rejects.toThrow(
            'Forbidden',
        )

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})

describe('useProjectMemberRemoveMutation', () => {
    it('removes the member and refreshes members and users', async () => {
        const removeSpy = vi.spyOn(ProjectApi, 'removeProjectMember').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useProjectMemberRemoveMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ projectId: 1, userId: 2 })

        expect(removeSpy).toHaveBeenCalledWith({ path: { projectId: 1, userId: 2 } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 1, 'members'] })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
        unmount()
    })
})
