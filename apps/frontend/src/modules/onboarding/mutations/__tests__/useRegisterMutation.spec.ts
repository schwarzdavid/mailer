import { afterEach, describe, expect, it, vi } from 'vitest'
import { SetupApi, type AuthenticationDto, type RegisterUserDto } from 'api'
import { useRegisterMutation } from '../useRegisterMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { JWT_KEY } from '@/constants/jwtKey.ts'

const registration: RegisterUserDto = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'correct-horse-battery-staple',
}

const authentication: AuthenticationDto = {
    token: 'jwt-token',
    user: {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
}

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem(JWT_KEY)
})

describe('useRegisterMutation', () => {
    it('sends the registration to SetupApi.registerUser', async () => {
        const registerSpy = vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        const { result, unmount } = withVueQuery(() => useRegisterMutation())

        await result.mutateAsync(registration)

        expect(registerSpy).toHaveBeenCalledWith({ body: registration })
        unmount()
    })

    it('stores the token and primes the auth and setup caches on success', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        const { result, queryClient, unmount } = withVueQuery(() => useRegisterMutation())

        await result.mutateAsync(registration)

        expect(queryClient.getQueryData(['auth.user'])).toEqual(authentication.user)
        expect(queryClient.getQueryData(['setup.status'])).toEqual({ needsSetup: false })
        expect(localStorage.getItem(JWT_KEY)).toContain('jwt-token')
        unmount()
    })

    it('caches nothing when the request fails', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useRegisterMutation())

        await expect(result.mutateAsync(registration)).rejects.toThrow('Forbidden')
        expect(queryClient.getQueryData(['auth.user'])).toBeUndefined()
        expect(queryClient.getQueryData(['setup.status'])).toBeUndefined()
        unmount()
    })
})
