import { Test, TestingModule } from '@nestjs/testing'
import { AppThrottlerGuard } from '../../throttler-storage/guards/app-throttler.guard.js'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SetupController } from './setup.controller.js'
import { SetupService } from '../services/setup.service.js'
import { JwtHelperService } from '../../auth/services/jwt-helper.service.js'
import { PoliciesGuard } from '../../permission/guards/policies.guard.js'
import { UserWithRole } from '../../user/interfaces/user.interface.js'
import { Role } from '../../permission/interfaces/role.interface.js'
import { RegisterUserDto } from '../dtos/register-user.dto.js'

describe('SetupController', () => {
    let controller: SetupController
    let getStep: Mock<SetupService['getStep']>
    let finishSetup: Mock<SetupService['finishSetup']>
    let registerFirstUser: Mock<SetupService['registerFirstUser']>
    let createToken: Mock<JwtHelperService['createToken']>

    const superAdminRole: Role = {
        roleId: 1,
        name: 'Super Admin',
        type: 'super_admin',
        scope: 'global',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const user: UserWithRole = {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        roleId: 1,
        role: superAdminRole,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const registration: RegisterUserDto = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'correct-horse-battery-staple',
        setupToken: 'the-token',
    }

    beforeEach(async () => {
        getStep = vi.fn<typeof getStep>().mockResolvedValue('account')
        finishSetup = vi.fn<typeof finishSetup>().mockResolvedValue('finished')
        registerFirstUser = vi.fn<typeof registerFirstUser>().mockResolvedValue(user)
        createToken = vi.fn<typeof createToken>().mockResolvedValue('jwt-token')

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SetupController],
            providers: [
                { provide: SetupService, useValue: { getStep, finishSetup, registerFirstUser } },
                { provide: JwtHelperService, useValue: { createToken } },
            ],
        })
            .overrideGuard(AppThrottlerGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: () => true })
            .compile()

        controller = module.get(SetupController)
    })

    it.each([
        ['account', true],
        ['sendingDomain', true],
        ['records', true],
        ['finished', false],
    ] as const)('reports the %s step with needsSetup=%s', async (step, needsSetup) => {
        getStep.mockResolvedValue(step)

        await expect(controller.getStatus()).resolves.toEqual({ needsSetup, step })
    })

    it('finishes the setup and reports the resulting status', async () => {
        await expect(controller.finishSetup()).resolves.toEqual({ needsSetup: false, step: 'finished' })
        expect(finishSetup).toHaveBeenCalledOnce()
    })

    it('passes the setup token separately and never into the user', async () => {
        const result = await controller.registerUser(registration)

        expect(registerFirstUser).toHaveBeenCalledWith(
            {
                firstName: 'Ada',
                lastName: 'Lovelace',
                email: 'ada@example.com',
                password: 'correct-horse-battery-staple',
            },
            'the-token',
        )
        expect(createToken).toHaveBeenCalledWith(user)
        expect(result).toEqual({ token: 'jwt-token', user })
    })
})
