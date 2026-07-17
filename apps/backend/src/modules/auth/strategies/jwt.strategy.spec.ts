import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cache } from '@nestjs/cache-manager'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JwtStrategy } from './jwt.strategy'
import { UserModel } from '../../user/models/user.model'
import { RoleModel } from '../../permission/models/role.model'
import { JwtPayload } from '../interfaces/jwt-payload.interface'
import { UserWithRole } from '../../user/interfaces/user.interface'

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
        roleId: 1,
        role: { roleId: 1, name: 'Super Admin', type: 'super_admin' },
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
        const cached: UserWithRole = {
            userId: 99,
            firstName: 'Lin',
            lastName: 'Clark',
            email: 'lin@example.com',
            roleId: 1,
            role: {
                roleId: 1,
                name: 'Super Admin',
                type: 'super_admin',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        }
        cacheGet.mockResolvedValue(cached)

        const result = await strategy.validate(payload)

        expect(result).toBe(cached)
        expect(cacheGet).toHaveBeenCalledWith('auth:user:99')
        expect(findByPk).not.toHaveBeenCalled()
    })

    it('treats a cached entry without roleId as a miss and re-caches the fresh principal', async () => {
        const staleCached = { userId: 99, email: 'lin@example.com' }
        cacheGet.mockResolvedValue(staleCached)
        findByPk.mockResolvedValue(dbUser)

        const result = await strategy.validate(payload)

        expect(findByPk).toHaveBeenCalledWith(99, { include: [RoleModel] })
        expect(result).toMatchObject({ userId: 99, roleId: 1 })
        expect(cacheSet).toHaveBeenCalledWith('auth:user:99', dbRow)
    })

    it('loads the user from the database and caches it on a cache miss', async () => {
        cacheGet.mockResolvedValue(undefined)
        findByPk.mockResolvedValue(dbUser)

        const result = await strategy.validate(payload)

        expect(findByPk).toHaveBeenCalledWith(99, { include: [RoleModel] })
        expect(result).toMatchObject({ userId: 99, email: 'lin@example.com' })
        expect(cacheSet).toHaveBeenCalledWith('auth:user:99', dbRow)
    })

    it('throws UnauthorizedException when the user no longer exists', async () => {
        cacheGet.mockResolvedValue(undefined)
        findByPk.mockResolvedValue(null)

        await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException)
        expect(cacheSet).not.toHaveBeenCalled()
    })
})
