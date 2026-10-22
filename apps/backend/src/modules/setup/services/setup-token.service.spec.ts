import { Logger } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from 'vitest'
import { SetupTokenService } from './setup-token.service.js'
import { UserModel } from '../../user/models/user.model.js'

describe('SetupTokenService', () => {
    let service: SetupTokenService
    let count: Mock<() => Promise<number>>
    let log: MockInstance<Logger['log']>

    beforeEach(async () => {
        count = vi.fn<typeof count>().mockResolvedValue(0)
        log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        const module: TestingModule = await Test.createTestingModule({
            providers: [SetupTokenService, { provide: getModelToken(UserModel), useValue: { count } }],
        }).compile()

        service = module.get(SetupTokenService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('issues a 32-character hex token', () => {
        expect(service.token).toMatch(/^[0-9a-f]{32}$/)
    })

    it('issues a different token per instance', async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [SetupTokenService, { provide: getModelToken(UserModel), useValue: { count } }],
        }).compile()

        expect(module.get(SetupTokenService).token).not.toBe(service.token)
    })

    it('matches only its own token', () => {
        expect(service.matches(service.token)).toBe(true)
        expect(service.matches(service.token.slice(1))).toBe(false)
        expect(service.matches('')).toBe(false)
        expect(service.matches('x'.repeat(32))).toBe(false)
    })

    it('logs the token on bootstrap while no user exists', async () => {
        await service.onApplicationBootstrap()

        expect(log).toHaveBeenCalledWith(`No user exists yet. Setup token: ${service.token}`)
    })

    it('does not log the token once a user exists', async () => {
        count.mockResolvedValue(1)

        await service.onApplicationBootstrap()

        expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Setup token'))
    })
})
