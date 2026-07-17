import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerGuard } from '@nestjs/throttler'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SetupController } from './setup.controller'
import { SetupService } from '../services/setup.service'
import { JwtHelperService } from '../../auth/services/jwt-helper.service'
import { UserWithRole } from '../../user/interfaces/user.interface'
import { Role } from '../../permission/interfaces/role.interface'
import { RegisterUserDto } from '../dtos/register-user.dto'

describe('SetupController', () => {
    let controller: SetupController
    let needsSetup: Mock<SetupService['needsSetup']>
    let registerFirstUser: Mock<SetupService['registerFirstUser']>
    let createToken: Mock<JwtHelperService['createToken']>

    const superAdminRole: Role = {
        roleId: 1,
        name: 'Super Admin',
        type: 'super_admin',
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
    }

    beforeEach(async () => {
        needsSetup = vi.fn<typeof needsSetup>().mockResolvedValue(true)
        registerFirstUser = vi.fn<typeof registerFirstUser>().mockResolvedValue(user)
        createToken = vi.fn<typeof createToken>().mockResolvedValue('jwt-token')

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SetupController],
            providers: [
                { provide: SetupService, useValue: { needsSetup, registerFirstUser } },
                { provide: JwtHelperService, useValue: { createToken } },
            ],
        })
            .overrideGuard(ThrottlerGuard)
            .useValue({ canActivate: () => true })
            .compile()

        controller = module.get(SetupController)
    })

    it('reports the setup status', async () => {
        await expect(controller.getStatus()).resolves.toEqual({ needsSetup: true })
    })

    it('registers the first user and returns an authentication', async () => {
        const result = await controller.registerUser(registration)

        expect(registerFirstUser).toHaveBeenCalledWith(registration)
        expect(createToken).toHaveBeenCalledWith(user)
        expect(result).toEqual({ token: 'jwt-token', user })
    })
})
