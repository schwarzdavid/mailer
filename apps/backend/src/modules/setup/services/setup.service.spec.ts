import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SetupService } from './setup.service.js'
import { UserService } from '../../user/services/user.service.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleService } from '../../permission/services/role.service.js'
import { Role } from '../../permission/interfaces/role.interface.js'
import { UserWithRole } from '../../user/interfaces/user.interface.js'
import { SETUP_LOCK_KEY } from '../setup.constants.js'
import { SettingsService } from '../../settings/services/settings.service.js'
import { Settings } from '../../settings/interfaces/settings.interface.js'

describe('SetupService', () => {
    let service: SetupService
    let count: Mock<(options?: { transaction: Transaction }) => Promise<number>>
    let createUser: Mock<UserService['createUser']>
    let getRoleByType: Mock<RoleService['getRoleByType']>
    let query: Mock<Sequelize['query']>
    let transaction: Mock<Sequelize['transaction']>
    let getSettings: Mock<SettingsService['getSettings']>
    let finishSetup: Mock<SettingsService['finishSetup']>

    const settings: Settings = {
        settingId: 1,
        sendingDomainId: 10,
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        setupFinishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const transactionStub = {} as Transaction

    const userCreate = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'correct-horse-battery-staple',
    }

    const superAdminRole: Role = {
        roleId: 1,
        name: 'Super Admin',
        scope: 'global',
        type: 'super_admin',
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

    beforeEach(async () => {
        count = vi.fn<typeof count>().mockResolvedValue(0)
        createUser = vi.fn<typeof createUser>().mockResolvedValue(user)
        getRoleByType = vi.fn<typeof getRoleByType>().mockResolvedValue(superAdminRole)
        query = vi.fn<typeof query>().mockResolvedValue([[], 0])
        getSettings = vi.fn<typeof getSettings>().mockResolvedValue(null)
        finishSetup = vi.fn<typeof finishSetup>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SetupService,
                { provide: Sequelize, useValue: { transaction, query } },
                { provide: UserService, useValue: { createUser } },
                { provide: RoleService, useValue: { getRoleByType } },
                { provide: SettingsService, useValue: { getSettings, finishSetup } },
                { provide: getModelToken(UserModel), useValue: { count } },
            ],
        }).compile()

        service = module.get(SetupService)
    })

    describe('getStep', () => {
        it('asks for the account while no user exists', async () => {
            await expect(service.getStep()).resolves.toBe('account')
            expect(getSettings).not.toHaveBeenCalled()
        })

        it('asks for the sending domain once a user exists but no settings row does', async () => {
            count.mockResolvedValue(1)

            await expect(service.getStep()).resolves.toBe('sendingDomain')
        })

        it('asks for the sending domain while the settings carry none', async () => {
            count.mockResolvedValue(1)
            getSettings.mockResolvedValue({ ...settings, sendingDomainId: null })

            await expect(service.getStep()).resolves.toBe('sendingDomain')
        })

        it('shows the records until the setup is finished', async () => {
            count.mockResolvedValue(1)
            getSettings.mockResolvedValue(settings)

            await expect(service.getStep()).resolves.toBe('records')
        })

        it('is finished once the finish time is stored', async () => {
            count.mockResolvedValue(1)
            getSettings.mockResolvedValue({ ...settings, setupFinishedAt: new Date() })

            await expect(service.getStep()).resolves.toBe('finished')
        })
    })

    describe('finishSetup', () => {
        it('marks the setup finished and reports the resulting step', async () => {
            count.mockResolvedValue(1)
            finishSetup.mockImplementation(() => {
                getSettings.mockResolvedValue({ ...settings, setupFinishedAt: new Date() })
                return Promise.resolve()
            })

            await expect(service.finishSetup()).resolves.toBe('finished')
            expect(finishSetup).toHaveBeenCalledOnce()
        })

        it('propagates a refusal from the settings', async () => {
            finishSetup.mockRejectedValue(
                new ConflictException('Configure a sending domain before finishing the setup.'),
            )

            await expect(service.finishSetup()).rejects.toBeInstanceOf(ConflictException)
        })
    })

    describe('registerFirstUser', () => {
        it('creates the user inside a locked transaction', async () => {
            const result = await service.registerFirstUser(userCreate)

            expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(:key)', {
                replacements: { key: SETUP_LOCK_KEY },
                transaction: transactionStub,
            })
            expect(count).toHaveBeenCalledWith({ transaction: transactionStub })
            expect(getRoleByType).toHaveBeenCalledWith('super_admin')
            expect(createUser).toHaveBeenCalledWith({ ...userCreate, roleId: 1 }, transactionStub)
            expect(result).toBe(user)
        })

        it('refuses to register once a user exists', async () => {
            count.mockResolvedValue(1)

            await expect(service.registerFirstUser(userCreate)).rejects.toBeInstanceOf(ForbiddenException)
            expect(createUser).not.toHaveBeenCalled()
        })
    })
})
