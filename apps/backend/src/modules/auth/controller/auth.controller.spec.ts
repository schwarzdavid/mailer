import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthController } from './auth.controller'
import { JwtHelperService } from '../services/jwt-helper.service'
import { User } from '../../user/interfaces/user.interface'

describe('AuthController', () => {
    let controller: AuthController
    let createToken: ReturnType<typeof vi.fn>

    // The principal a passing LocalAuthGuard attaches to the request. Stripping it to a
    // response DTO happens in the ClassSerializerInterceptor (@ResponseDto), so that is
    // covered by DTO serialization / e2e, not these delegation-focused tests.
    const principal: User = {
        userId: 42,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        createToken = vi.fn().mockResolvedValue('signed-jwt-token')

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [{ provide: JwtHelperService, useValue: { createToken } }],
        }).compile()

        controller = module.get<AuthController>(AuthController)
    })

    it('should be defined', () => {
        expect(controller).toBeDefined()
    })

    it('signs a token for the authenticated principal and returns it with the user', async () => {
        const result = await controller.login(principal)

        expect(createToken).toHaveBeenCalledWith(principal)
        expect(result.token).toBe('signed-jwt-token')
        expect(result.user).toBe(principal)
    })

    it('returns the authenticated principal from the current-user endpoint', () => {
        expect(controller.currentUser(principal)).toBe(principal)
    })
})
