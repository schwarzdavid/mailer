import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserApi, type UserDto, type UserUpdateDto } from 'api'
import { useUserUpdateMutation } from '../useUserUpdateMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const body: UserUpdateDto = { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', roleId: 2 }

const currentUser: UserDto = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: { roleId: 2, name: 'Admin', type: 'admin' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function updated(userId: number): UserDto {
    return { ...currentUser, ...body, userId }
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUserUpdateMutation', () => {
    it('updates the user with the given body', async () => {
        const update = vi.spyOn(UserApi, 'updateUser').mockResolvedValue(updated(7))
        const { result, unmount } = withVueQuery(() => useUserUpdateMutation())

        await result.mutateAsync({ userId: 7, body })

        expect(update).toHaveBeenCalledWith({ path: { userId: 7 }, body })
        unmount()
    })

    it('invalidates the users but not the own session for another user', async () => {
        vi.spyOn(UserApi, 'updateUser').mockResolvedValue(updated(7))
        const { result, queryClient, unmount } = withVueQuery(() => useUserUpdateMutation())
        queryClient.setQueryData(['auth.user'], currentUser)
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ userId: 7, body })

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
        expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['auth.user'] })
        expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['auth.ability'] })
        expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['auth.permissions'] })
        unmount()
    })

    it('reloads the own profile and abilities when editing oneself', async () => {
        vi.spyOn(UserApi, 'updateUser').mockResolvedValue(updated(1))
        const { result, queryClient, unmount } = withVueQuery(() => useUserUpdateMutation())
        queryClient.setQueryData(['auth.user'], currentUser)
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ userId: 1, body })

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth.user'] })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth.ability'] })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth.permissions'] })
        unmount()
    })
})
