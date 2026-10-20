import { instanceToPlain, plainToInstance } from 'class-transformer'
import { describe, expect, it } from 'vitest'
import { UserDto, UserListDto } from './user.dto.js'

describe('UserDto serialization', () => {
    // Mirrors what the global ClassSerializerInterceptor does for responses: only the
    // @Expose()d fields survive, so the password hash can never reach the client — even
    // though the services now hand raw rows (with the hash) up to the transport layer.
    it('exposes the public fields and never the password', () => {
        const row = {
            userId: 1,
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            password: 'super-secret-hash',
            role: { roleId: 3, name: 'User', type: 'user' },
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        const serialized = instanceToPlain(plainToInstance(UserDto, row, { excludeExtraneousValues: true }), {
            excludeExtraneousValues: true,
        })

        expect(serialized).toMatchObject({
            userId: 1,
            email: 'ada@example.com',
            role: { roleId: 3, name: 'User', type: 'user' },
        })
        expect('roleId' in serialized).toBe(false)
        expect('password' in serialized).toBe(false)
    })

    it('adds the membership count to list entries without leaking the password', () => {
        const row = {
            userId: 2,
            firstName: 'Grace',
            lastName: 'Hopper',
            email: 'grace@example.com',
            password: 'super-secret-hash',
            role: { roleId: 3, name: 'User', type: 'user' },
            membershipCount: 4,
            allProjects: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        const serialized = instanceToPlain(plainToInstance(UserListDto, row, { excludeExtraneousValues: true }), {
            excludeExtraneousValues: true,
        })

        expect(serialized).toMatchObject({ userId: 2, membershipCount: 4, allProjects: true })
        expect('password' in serialized).toBe(false)
    })
})
