import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserApi, type Permission, type UserDto } from 'api'
import { useUserPermissionsMutation } from '../useUserPermissionsMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const permissions: Permission[] = ['domains.read', 'bounces.read']

const currentUser: UserDto = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: { roleId: 2, name: 'Admin', type: 'admin' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUserPermissionsMutation', () => {
    it('replaces the permissions of the user', async () => {
        const replace = vi.spyOn(UserApi, 'replaceUserPermissions').mockResolvedValue({ permissions })
        const { result, unmount } = withVueQuery(() => useUserPermissionsMutation())

        await result.mutateAsync({ userId: 7, permissions })

        expect(replace).toHaveBeenCalledWith({ path: { userId: 7 }, body: { permissions } })
        unmount()
    })

    it('invalidates the users but keeps the own abilities for another user', async () => {
        vi.spyOn(UserApi, 'replaceUserPermissions').mockResolvedValue({ permissions })
        const { result, queryClient, unmount } = withVueQuery(() => useUserPermissionsMutation())
        queryClient.setQueryData(['auth.user'], currentUser)
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ userId: 7, permissions })

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
        expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['auth.ability'] })
        unmount()
    })

    it('reloads the own abilities when editing oneself', async () => {
        vi.spyOn(UserApi, 'replaceUserPermissions').mockResolvedValue({ permissions })
        const { result, queryClient, unmount } = withVueQuery(() => useUserPermissionsMutation())
        queryClient.setQueryData(['auth.user'], currentUser)
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ userId: 1, permissions })

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth.ability'] })
        unmount()
    })
})
