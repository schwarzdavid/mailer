import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { BootstrapService } from './bootstrap.service'
import { UserService } from '../modules/user/services/user.service'
import { UserModel } from '../modules/user/models/user.model'
import { User } from '../modules/user/interfaces/user.interface'

describe('BootstrapService', () => {
    let service: BootstrapService
    let count: Mock<() => Promise<number>>
    let createUser: Mock<UserService['createUser']>
    let get: Mock<(key: string, defaultValue: string) => string>

    const createdUser: User = {
        userId: 1,
        firstName: 'Admin',
        lastName: 'Admin',
        email: 'admin@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        count = vi.fn<() => Promise<number>>()
        createUser = vi.fn<UserService['createUser']>().mockResolvedValue(createdUser)
        get = vi.fn<(key: string, defaultValue: string) => string>().mockImplementation((_key, defaultValue) => defaultValue)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BootstrapService,
                { provide: UserService, useValue: { createUser } },
                { provide: ConfigService, useValue: { get } },
                { provide: getModelToken(UserModel), useValue: { count } },
            ],
        }).compile()

        service = module.get(BootstrapService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not seed an admin when users already exist', async () => {
        count.mockResolvedValue(3)

        await service.onApplicationBootstrap()

        expect(createUser).not.toHaveBeenCalled()
    })

    it('seeds an admin with a generated password when the users table is empty', async () => {
        count.mockResolvedValue(0)

        await service.onApplicationBootstrap()

        expect(createUser).toHaveBeenCalledTimes(1)
        const created = createUser.mock.calls[0]![0]
        expect(created).toMatchObject({ firstName: 'Admin', lastName: 'Admin', email: 'admin@example.com' })
        expect(created.password).toMatch(/^[0-9a-f]{32}$/)
    })

    it('uses the configured admin email when one is provided', async () => {
        count.mockResolvedValue(0)
        get.mockReturnValue('root@corp.example')

        await service.onApplicationBootstrap()

        expect(get).toHaveBeenCalledWith('ADMIN_EMAIL', 'admin@example.com')
        expect(createUser.mock.calls[0]![0]).toMatchObject({ email: 'root@corp.example' })
    })
})
