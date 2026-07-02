import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserService } from './user.service'
import { UserModel } from '../models/user.model'

interface CreateAttrs {
    firstName: string
    lastName: string
    email: string
    password: string
}

describe('UserService', () => {
    let service: UserService
    let create: ReturnType<typeof vi.fn>
    // The password value handed to the model, captured so we can prove it was hashed.
    let storedPassword: string | undefined

    const newUser = {
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan@example.com',
        password: 'enigma-1912',
    }

    beforeEach(async () => {
        storedPassword = undefined
        // Mirror Sequelize's create({ returning: true }): resolve a model instance whose
        // get({ plain: true }) returns the persisted row.
        create = vi.fn((attrs: CreateAttrs) => {
            storedPassword = attrs.password
            const row = { userId: 7, createdAt: new Date(), updatedAt: new Date(), ...attrs }
            return { ...row, get: () => row }
        })

        const module: TestingModule = await Test.createTestingModule({
            providers: [UserService, { provide: getModelToken(UserModel), useValue: { create } }],
        }).compile()

        service = module.get(UserService)
    })

    it('persists the supplied profile fields', async () => {
        await service.createUser(newUser)

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                firstName: 'Alan',
                lastName: 'Turing',
                email: 'alan@example.com',
            }),
            { returning: true },
        )
    })

    it('hashes the password instead of storing it in plain text', async () => {
        await service.createUser(newUser)

        expect(storedPassword).toBeDefined()
        expect(storedPassword).not.toBe(newUser.password)
        // The stored value is a real bcrypt hash of the original password.
        await expect(bcrypt.compare(newUser.password, storedPassword!)).resolves.toBe(true)
    })

    it('returns the persisted user', async () => {
        const result = await service.createUser(newUser)

        expect(result).toMatchObject({
            userId: 7,
            firstName: 'Alan',
            lastName: 'Turing',
            email: 'alan@example.com',
        })
    })
})
