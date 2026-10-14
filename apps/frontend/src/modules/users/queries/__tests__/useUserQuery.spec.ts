import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { QueryClient } from '@tanstack/vue-query'
import { UserApi, type UserDetailDto } from 'api'
import { useUserQuery } from '../useUserQuery.ts'

const detail: UserDetailDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    permissions: [],
    memberships: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUserQuery', () => {
    it('fetches the user by id', async () => {
        const getUser = vi.spyOn(UserApi, 'getUser').mockResolvedValue(detail)

        await expect(new QueryClient().fetchQuery(useUserQuery(7))).resolves.toEqual(detail)
        expect(getUser).toHaveBeenCalledWith({ path: { userId: 7 } })
    })

    it('resolves a getter id at fetch time', async () => {
        const getUser = vi.spyOn(UserApi, 'getUser').mockResolvedValue(detail)
        const userId = ref(7)
        const options = useUserQuery(() => userId.value)
        userId.value = 8

        await new QueryClient().fetchQuery(options)

        expect(getUser).toHaveBeenCalledWith({ path: { userId: 8 } })
    })

    it('is keyed beneath the users key so list invalidation refreshes it', async () => {
        vi.spyOn(UserApi, 'getUser').mockResolvedValue(detail)
        const client = new QueryClient()
        const options = useUserQuery(7)
        await client.fetchQuery(options)

        await client.invalidateQueries({ queryKey: ['users'] })

        expect(client.getQueryState(options.queryKey)?.isInvalidated).toBe(true)
    })
})
