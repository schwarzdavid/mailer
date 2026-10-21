import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { UserApi, type UserListDto } from 'api'
import { useUsersQuery } from '../useUsersQuery.ts'

const users: UserListDto[] = [
    {
        userId: 7,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        role: { roleId: 3, name: 'User', type: 'user' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        membershipCount: 0,
        allProjects: false,
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUsersQuery', () => {
    it('loads all users under the users key', async () => {
        const getUsers = vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const options = useUsersQuery()

        await expect(new QueryClient().fetchQuery(options)).resolves.toEqual(users)
        expect(options.queryKey).toEqual(['users'])
        expect(getUsers).toHaveBeenCalledTimes(1)
    })
})
