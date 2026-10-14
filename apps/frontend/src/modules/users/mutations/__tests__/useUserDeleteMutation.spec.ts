import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserApi } from 'api'
import { useUserDeleteMutation } from '../useUserDeleteMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUserDeleteMutation', () => {
    it('deletes the user by id and invalidates the user list', async () => {
        const remove = vi.spyOn(UserApi, 'deleteUser').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useUserDeleteMutation())
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync(7)

        expect(remove).toHaveBeenCalledWith({ path: { userId: 7 } })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
        unmount()
    })

    it('does not invalidate anything when deletion fails', async () => {
        vi.spyOn(UserApi, 'deleteUser').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useUserDeleteMutation())
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync(7)).rejects.toThrow('Forbidden')

        expect(invalidate).not.toHaveBeenCalled()
        unmount()
    })
})
