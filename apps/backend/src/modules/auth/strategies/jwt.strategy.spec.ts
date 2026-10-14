import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Cache } from '@nestjs/cache-manager'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JwtStrategy } from './jwt.strategy.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from '../../permission/models/role.model.js'
import { JwtPayload } from '../interfaces/jwt-payload.interface.js'
import { UserWithRole } from '../../user/interfaces/user.interface.js'
import type { Env } from '../../../config/env.schema.js'

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

    const principal: UserWithRole = {
        userId: 99,
        firstName: 'Lin',
        lastName: 'Clark',
        email: 'lin@example.com',
        roleId: 1,
        role: { roleId: 1, name: 'Super Admin', type: 'super_admin', createdAt: new Date(), updatedAt: new Date() },
        createdAt: new Date(),
        updatedAt: new Date(),
    }
    const dbRow: UserWithRole & { password: string } = { ...principal, password: 'hashed' }
    // A Sequelize-like instance exposing get({ plain: true }).
    const dbUser = { ...dbRow, get: () => dbRow }

    beforeEach(() => {
        cacheGet = vi.fn().mockResolvedValue(undefined)
        cacheSet = vi.fn().mockResolvedValue(undefined)
        findByPk = vi.fn()

        const configService = {
            get: vi.fn().mockReturnValue('test-secret'),
        } as unknown as ConfigService<Env, true>
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
        expect(cacheSet).toHaveBeenCalledWith('auth:user:99', principal)
    })

    it('loads the user from the database and caches it on a cache miss', async () => {
        cacheGet.mockResolvedValue(undefined)
        findByPk.mockResolvedValue(dbUser)

        const result = await strategy.validate(payload)

        expect(findByPk).toHaveBeenCalledWith(99, { include: [RoleModel] })
        expect(result).toMatchObject({ userId: 99, email: 'lin@example.com' })
        expect(cacheSet).toHaveBeenCalledWith('auth:user:99', principal)
    })

    it('never caches or returns the password hash even when the row carries it', async () => {
        cacheGet.mockResolvedValue(undefined)
        findByPk.mockResolvedValue(dbUser)

        const result = await strategy.validate(payload)

        expect(result).toEqual(principal)
        expect(result).not.toHaveProperty('password')
        const [, cached] = cacheSet.mock.calls[0] as [string, object]
        expect(cached).not.toHaveProperty('password')
    })

    it('throws UnauthorizedException when the user no longer exists', async () => {
        cacheGet.mockResolvedValue(undefined)
        findByPk.mockResolvedValue(null)

        await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException)
        expect(cacheSet).not.toHaveBeenCalled()
    })

    describe('token verification', () => {
        interface PassportOutcome {
            outcome: 'success' | 'fail' | 'error'
            user?: unknown
        }

        interface PassportHooks {
            success: (user: unknown) => void
            fail: () => void
            error: (error: unknown) => void
            authenticate: (request: { headers: Record<string, string> }) => void
        }

        const signer = new JwtService({ secret: 'test-secret' })

        function authenticate(authorization?: string): Promise<PassportOutcome> {
            return new Promise((resolve) => {
                const hooks = strategy as unknown as PassportHooks
                hooks.success = (user) => resolve({ outcome: 'success', user })
                hooks.fail = () => resolve({ outcome: 'fail' })
                hooks.error = () => resolve({ outcome: 'error' })
                hooks.authenticate({ headers: authorization === undefined ? {} : { authorization } })
            })
        }

        function base64Url(value: object): string {
            return Buffer.from(JSON.stringify(value)).toString('base64url')
        }

        beforeEach(() => {
            findByPk.mockResolvedValue(dbUser)
        })

        it('authenticates a bearer token signed with the configured secret', async () => {
            const token = await signer.signAsync(payload)

            const result = await authenticate(`Bearer ${token}`)

            expect(result.outcome).toBe('success')
            expect(result.user).toMatchObject({ userId: 99 })
        })

        it('rejects a request without a token', async () => {
            await expect(authenticate()).resolves.toEqual({ outcome: 'fail' })
            expect(findByPk).not.toHaveBeenCalled()
        })

        it('rejects a token signed with a different secret', async () => {
            const token = await new JwtService({ secret: 'attacker-secret' }).signAsync(payload)

            await expect(authenticate(`Bearer ${token}`)).resolves.toEqual({ outcome: 'fail' })
            expect(findByPk).not.toHaveBeenCalled()
        })

        it('rejects an expired token', async () => {
            const token = await signer.signAsync({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 })

            await expect(authenticate(`Bearer ${token}`)).resolves.toEqual({ outcome: 'fail' })
            expect(findByPk).not.toHaveBeenCalled()
        })

        it('rejects an unsigned token', async () => {
            const token = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url(payload)}.`

            await expect(authenticate(`Bearer ${token}`)).resolves.toEqual({ outcome: 'fail' })
            expect(findByPk).not.toHaveBeenCalled()
        })

        it('rejects a token whose payload was altered after signing', async () => {
            const [header, , signature] = (await signer.signAsync(payload)).split('.')
            const forged = `${header}.${base64Url({ ...payload, sub: 1 })}.${signature}`

            await expect(authenticate(`Bearer ${forged}`)).resolves.toEqual({ outcome: 'fail' })
            expect(findByPk).not.toHaveBeenCalled()
        })

        it('rejects a token that is not sent as a bearer token', async () => {
            const token = await signer.signAsync(payload)

            await expect(authenticate(token)).resolves.toEqual({ outcome: 'fail' })
        })
    })
})
