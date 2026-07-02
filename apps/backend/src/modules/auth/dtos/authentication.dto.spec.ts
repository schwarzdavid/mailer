import 'reflect-metadata'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { describe, expect, it } from 'vitest'
import { AuthenticationDto } from './authentication.dto'

describe('AuthenticationDto serialization', () => {
    // Proves the @ResponseDto(AuthenticationDto) path: the nested principal (which now
    // carries the password hash) is converted via @Type(() => UserDto) and stripped, so
    // the login response can never leak the hash.
    it('serializes the nested user through UserDto and drops the password', () => {
        const payload = {
            token: 'signed-jwt',
            user: {
                userId: 1,
                firstName: 'Ada',
                lastName: 'Lovelace',
                email: 'ada@example.com',
                password: 'super-secret-hash',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }

        const serialized = instanceToPlain(
            plainToInstance(AuthenticationDto, payload, { excludeExtraneousValues: true }),
            { excludeExtraneousValues: true },
        )

        expect(serialized.token).toBe('signed-jwt')
        expect(serialized.user).toMatchObject({ userId: 1, email: 'ada@example.com' })
        expect('password' in (serialized.user as object)).toBe(false)
    })
})
