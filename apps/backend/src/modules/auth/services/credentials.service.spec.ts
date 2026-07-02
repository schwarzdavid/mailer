import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { UnauthorizedException } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CredentialsService } from './credentials.service'
import { UserModel } from '../../user/models/user.model'

describe('CredentialsService', () => {
    let service: CredentialsService
    let findOne: ReturnType<typeof vi.fn>

    // The real password and its real bcrypt hash, so bcrypt.compare runs for real
    // rather than against a stub.
    const password = 'correct-horse-battery-staple'
    let hashedPassword: string

    const buildUser = (overrides: Record<string, unknown> = {}) => ({
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    })

    beforeEach(async () => {
        hashedPassword = await bcrypt.hash(password, 10)
        findOne = vi.fn()

        const module: TestingModule = await Test.createTestingModule({
            providers: [CredentialsService, { provide: getModelToken(UserModel), useValue: { findOne } }],
        }).compile()

        service = module.get(CredentialsService)
    })

    it('returns a password-free user when the credentials are valid', async () => {
        findOne.mockResolvedValue(buildUser())

        const result = await service.validateCredentials({
            email: 'ada@example.com',
            password,
        })

        expect(result.userId).toBe(1)
        expect(result.email).toBe('ada@example.com')
        expect('password' in result).toBe(false)
    })

    it('looks the user up by email and rejects on an empty result', async () => {
        findOne.mockResolvedValue(buildUser())

        await service.validateCredentials({ email: 'ada@example.com', password })

        expect(findOne).toHaveBeenCalledWith({
            where: { email: 'ada@example.com' },
            rejectOnEmpty: true,
        })
    })

    it('throws UnauthorizedException when the password does not match', async () => {
        findOne.mockResolvedValue(buildUser())

        await expect(
            service.validateCredentials({
                email: 'ada@example.com',
                password: 'wrong-password',
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('propagates the lookup error when no user matches the email', async () => {
        // With rejectOnEmpty set, Sequelize rejects (EmptyResultError) instead of
        // resolving null; the service lets that error bubble up.
        findOne.mockRejectedValue(new Error('EmptyResultError'))

        await expect(service.validateCredentials({ email: 'nobody@example.com', password })).rejects.toThrow(
            'EmptyResultError',
        )
    })
})
