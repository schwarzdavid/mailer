import { Logger, UnauthorizedException } from '@nestjs/common'
import { EmptyResultError } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { LocalStrategy } from './local.strategy.js'
import { CredentialsService } from '../services/credentials.service.js'
import { User } from '../../user/interfaces/user.interface.js'

describe('LocalStrategy', () => {
    let strategy: LocalStrategy
    let validateCredentials: ReturnType<typeof vi.fn>
    let warnSpy: MockInstance<Logger['warn']>
    let errorSpy: MockInstance<Logger['error']>

    const user: User = {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        roleId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(() => {
        warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        validateCredentials = vi.fn()
        const credentialsService = {
            validateCredentials,
        } as unknown as CredentialsService

        strategy = new LocalStrategy(credentialsService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns the user the credentials service validates', async () => {
        validateCredentials.mockResolvedValue(user)

        const result = await strategy.validate('ada@example.com', 'secret')

        expect(result).toBe(user)
        expect(validateCredentials).toHaveBeenCalledWith({
            email: 'ada@example.com',
            password: 'secret',
        })
    })

    it('translates any validation failure into an UnauthorizedException', async () => {
        validateCredentials.mockRejectedValue(new Error('boom'))

        await expect(strategy.validate('ada@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it.each([
        ['an unknown user', new EmptyResultError('No user ada@example.com')],
        ['a wrong password', new UnauthorizedException('Invalid credentials.')],
    ])('logs a failed login for %s as a warning without the e-mail address', async (_case, error) => {
        validateCredentials.mockRejectedValue(error)

        await expect(strategy.validate('ada@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException)

        expect(warnSpy).toHaveBeenCalledExactlyOnceWith('Login failed')
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('logs any other failure as an error with only the error name and still answers 401', async () => {
        validateCredentials.mockRejectedValue(new TypeError('cannot read ada@example.com'))

        await expect(strategy.validate('ada@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException)

        expect(errorSpy).toHaveBeenCalledExactlyOnceWith('Login failed: TypeError')
        expect(warnSpy).not.toHaveBeenCalled()
    })
})
