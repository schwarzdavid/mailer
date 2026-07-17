import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, type UserDto } from 'api'
import { useAuthQuery } from '../useAuthQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { useQuery } from '@tanstack/vue-query'

const user: UserDto = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'admin@example.com',
    role: {
        type: 'super_admin',
        roleId: 1,
        name: 'Super Admin',
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useAuthQuery', () => {
    it('loads the current user from AuthApi.currentUser', async () => {
        const currentUserSpy = vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(user)
        const { result, unmount } = withVueQuery(() => useQuery(useAuthQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(currentUserSpy).toHaveBeenCalledOnce()
        expect(result.data.value).toEqual(user)
        unmount()
    })

    it('exposes the user under the auth.user query key', async () => {
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(user)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useAuthQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(queryClient.getQueryData(['auth.user'])).toEqual(user)
        unmount()
    })

    it('reports an error state when the request fails', async () => {
        vi.spyOn(AuthApi, 'currentUser').mockRejectedValue(new Error('Unauthorized'))
        const { result, unmount } = withVueQuery(() => useQuery(useAuthQuery()))

        await vi.waitFor(() => expect(result.isError.value).toBe(true))

        expect(result.error.value).toEqual(new Error('Unauthorized'))
        unmount()
    })
})
