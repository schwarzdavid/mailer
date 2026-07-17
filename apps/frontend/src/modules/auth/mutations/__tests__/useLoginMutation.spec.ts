import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, type AuthenticationDto, type CredentialsDto } from 'api'
import { useLoginMutation } from '../useLoginMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const credentials: CredentialsDto = {
    email: 'admin@example.com',
    password: 'super-secret',
}

const authentication: AuthenticationDto = {
    token: 'jwt-token',
    user: {
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
    },
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useLoginMutation', () => {
    it('sends the credentials to AuthApi.login', async () => {
        const loginSpy = vi.spyOn(AuthApi, 'login').mockResolvedValue(authentication)
        const { result, unmount } = withVueQuery(() => useLoginMutation())

        await result.mutateAsync(credentials)

        expect(loginSpy).toHaveBeenCalledWith({ body: credentials })
        unmount()
    })

    it('caches the authenticated user under the auth.user query key on success', async () => {
        vi.spyOn(AuthApi, 'login').mockResolvedValue(authentication)
        const { result, queryClient, unmount } = withVueQuery(() => useLoginMutation())

        await result.mutateAsync(credentials)

        expect(queryClient.getQueryData(['auth.user'])).toEqual(authentication.user)
        unmount()
    })

    it('clears the stale ability cache on success', async () => {
        vi.spyOn(AuthApi, 'login').mockResolvedValue(authentication)
        const { result, queryClient, unmount } = withVueQuery(() => useLoginMutation())
        queryClient.setQueryData(['auth.ability'], [{ action: ['read'], subject: 'Domain' }])

        await result.mutateAsync(credentials)

        expect(queryClient.getQueryData(['auth.ability'])).toBeUndefined()
        unmount()
    })

    it('rejects and caches no user when the request fails', async () => {
        vi.spyOn(AuthApi, 'login').mockRejectedValue(new Error('Invalid credentials'))
        const { result, queryClient, unmount } = withVueQuery(() => useLoginMutation())

        await expect(result.mutateAsync(credentials)).rejects.toThrow('Invalid credentials')
        expect(queryClient.getQueryData(['auth.user'])).toBeUndefined()
        unmount()
    })
})
