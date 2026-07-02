import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cache } from '@nestjs/cache-manager'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JwtStrategy } from './jwt.strategy'
import { UserModel } from '../../user/models/user.model'
import { JwtPayload } from '../interfaces/jwt-payload.interface'

describe('JwtStrategy', () => {
    let strategy: JwtStrategy
    let cacheGet: ReturnType<typeof vi.fn>
    let cacheSet: ReturnType<typeof vi.fn>
    let findByPk: ReturnType<typeof vi.fn>

    const payload: JwtPayload = {
        sub: 99,
        email: 'lin@example.com',
        given_name: 'Lin',
        family_name: 'Clark',
    }

    const dbRow = {
        userId: 99,
        firstName: 'Lin',
        lastName: 'Clark',
        email: 'lin@example.com',
        password: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
    }
    // A Sequelize-like instance exposing get({ plain: true }).
    const dbUser = { ...dbRow, get: () => dbRow }

    beforeEach(() => {
        cacheGet = vi.fn().mockResolvedValue(undefined)
        cacheSet = vi.fn().mockResolvedValue(undefined)
        findByPk = vi.fn()

        const configService = {
            get: vi.fn().mockReturnValue('test-secret'),
        } as unknown as ConfigService
        const cacheManager = { get: cacheGet, set: cacheSet } as unknown as Cache
        const userModel = { findByPk } as unknown as typeof UserModel

        strategy = new JwtStrategy(configService, cacheManager, userModel)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns the cached user without touching the database', async () => {
        const cached = { userId: 99, email: 'lin@example.com' }
        cacheGet.mockResolvedValue(cached)

        const result = await strategy.validate(payload)

        expect(result).toBe(cached)
        expect(cacheGet).toHaveBeenCalledWith('auth:user:99')
        expect(findByPk).not.toHaveBeenCalled()
    })

    it('loads the user from the database and caches it on a cache miss', async () => {
        cacheGet.mockResolvedValue(undefined)
        findByPk.mockResolvedValue(dbUser)

        const result = await strategy.validate(payload)

        expect(findByPk).toHaveBeenCalledWith(99)
        expect(result).toMatchObject({ userId: 99, email: 'lin@example.com' })
        expect(cacheSet).toHaveBeenCalledWith('auth:user:99', dbUser)
    })

    it('throws UnauthorizedException when the user no longer exists', async () => {
        cacheGet.mockResolvedValue(undefined)
        findByPk.mockResolvedValue(null)

        await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException)
        expect(cacheSet).not.toHaveBeenCalled()
    })
})
