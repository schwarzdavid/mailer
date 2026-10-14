import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserApi, type UserCreateDto, type UserDto } from 'api'
import { useUserCreateMutation } from '../useUserCreateMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const body: UserCreateDto = {
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    password: 'cobol-1959',
    roleId: 3,
}

const created: UserDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUserCreateMutation', () => {
    it('creates the user and invalidates the user list', async () => {
        const create = vi.spyOn(UserApi, 'createUser').mockResolvedValue(created)
        const { result, queryClient, unmount } = withVueQuery(() => useUserCreateMutation())
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync(body)).resolves.toEqual(created)

        expect(create).toHaveBeenCalledWith({ body })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
        unmount()
    })

    it('does not invalidate anything when creation fails', async () => {
        vi.spyOn(UserApi, 'createUser').mockRejectedValue(new Error('Email already taken'))
        const { result, queryClient, unmount } = withVueQuery(() => useUserCreateMutation())
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync(body)).rejects.toThrow('Email already taken')

        expect(invalidate).not.toHaveBeenCalled()
        unmount()
    })
})
