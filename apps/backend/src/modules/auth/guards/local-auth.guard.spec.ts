import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js'
import { AuthGuard } from '@nestjs/passport'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { LocalAuthGuard } from './local-auth.guard.js'
import { CredentialsDto } from '../dtos/credentials.dto.js'

describe('LocalAuthGuard', () => {
    let guard: LocalAuthGuard
    let passportCanActivate: MockInstance<LocalAuthGuard['canActivate']>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [LocalAuthGuard],
        }).compile()

        guard = module.get(LocalAuthGuard)
        passportCanActivate = vi.spyOn(AuthGuard('local').prototype, 'canActivate').mockResolvedValue(true)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('should be defined', () => {
        expect(guard).toBeDefined()
    })

    it('hands well-formed credentials to passport as a validated dto', async () => {
        const request = { body: { email: 'grace@example.com', password: 'secret' } }

        await expect(guard.canActivate(new ExecutionContextHost([request]))).resolves.toBe(true)

        expect(request.body).toBeInstanceOf(CredentialsDto)
        expect(passportCanActivate).toHaveBeenCalledOnce()
    })

    it.each([
        ['a missing body', undefined],
        ['a malformed email', { email: 'not-an-email', password: 'secret' }],
        ['an empty password', { email: 'grace@example.com', password: '' }],
        ['a non-string password', { email: 'grace@example.com', password: 42 }],
        ['unknown properties', { email: 'grace@example.com', password: 'secret', isAdmin: true }],
    ])('rejects %s with 400 before passport runs', async (_case, body) => {
        await expect(guard.canActivate(new ExecutionContextHost([{ body }]))).rejects.toBeInstanceOf(
            BadRequestException,
        )

        expect(passportCanActivate).not.toHaveBeenCalled()
    })
})
