import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { ForbiddenException } from '@nestjs/common'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SetupService } from './setup.service'
import { UserService } from '../../user/services/user.service'
import { UserModel } from '../../user/models/user.model'
import { User, UserCreate } from '../../user/interfaces/user.interface'
import { SETUP_LOCK_KEY } from '../setup.constants'

describe('SetupService', () => {
    let service: SetupService
    let count: Mock<(options?: { transaction: Transaction }) => Promise<number>>
    let createUser: Mock<UserService['createUser']>
    let query: Mock<Sequelize['query']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    const userCreate: UserCreate = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'correct-horse-battery-staple',
    }

    const user: User = {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        count = vi.fn<typeof count>().mockResolvedValue(0)
        createUser = vi.fn<typeof createUser>().mockResolvedValue(user)
        query = vi.fn<typeof query>().mockResolvedValue([[], 0])
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SetupService,
                { provide: Sequelize, useValue: { transaction, query } },
                { provide: UserService, useValue: { createUser } },
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
            expect(createUser).toHaveBeenCalledWith(userCreate, transactionStub)
            expect(result).toBe(user)
        })

        it('refuses to register once a user exists', async () => {
            count.mockResolvedValue(1)

            await expect(service.registerFirstUser(userCreate)).rejects.toBeInstanceOf(ForbiddenException)
            expect(createUser).not.toHaveBeenCalled()
        })
    })
})
