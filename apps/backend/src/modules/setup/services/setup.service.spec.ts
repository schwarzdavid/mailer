import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { ForbiddenException } from '@nestjs/common'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SetupService } from './setup.service'
import { UserService } from '../../user/services/user.service'
import { UserModel } from '../../user/models/user.model'
import { RoleService } from '../../permission/services/role.service'
import { Role } from '../../permission/interfaces/role.interface'
import { UserWithRole } from '../../user/interfaces/user.interface'
import { SETUP_LOCK_KEY } from '../setup.constants'

describe('SetupService', () => {
    let service: SetupService
    let count: Mock<(options?: { transaction: Transaction }) => Promise<number>>
    let createUser: Mock<UserService['createUser']>
    let getRoleByType: Mock<RoleService['getRoleByType']>
    let query: Mock<Sequelize['query']>
    let transaction: Mock<Sequelize['transaction']>

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

    beforeEach(async () => {
        count = vi.fn<typeof count>().mockResolvedValue(0)
        createUser = vi.fn<typeof createUser>().mockResolvedValue(user)
        getRoleByType = vi.fn<typeof getRoleByType>().mockResolvedValue(superAdminRole)
        query = vi.fn<typeof query>().mockResolvedValue([[], 0])
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SetupService,
                { provide: Sequelize, useValue: { transaction, query } },
                { provide: UserService, useValue: { createUser } },
                { provide: RoleService, useValue: { getRoleByType } },
                { provide: getModelToken(UserModel), useValue: { count } },
            ],
        }).compile()

        service = module.get(SetupService)
    })

    describe('needsSetup', () => {
        it('is true while no user exists', async () => {
            await expect(service.needsSetup()).resolves.toBe(true)
        })

        it('is false once a user exists', async () => {
            count.mockResolvedValue(1)

            await expect(service.needsSetup()).resolves.toBe(false)
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
