import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { RegisterUserDto } from './register-user.dto.js'

async function violations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(RegisterUserDto, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe('RegisterUserDto', () => {
    const valid = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', password: 'correct-horse' }

    it('accepts a complete registration', async () => {
        await expect(violations(valid)).resolves.toEqual([])
    })

    it('requires every field', async () => {
        await expect(violations({})).resolves.toEqual(['firstName', 'lastName', 'email', 'password'])
    })

    it('rejects empty names', async () => {
        await expect(violations({ ...valid, firstName: '', lastName: '' })).resolves.toEqual(['firstName', 'lastName'])
    })

    it('rejects an invalid email', async () => {
        await expect(violations({ ...valid, email: 'ada' })).resolves.toEqual(['email'])
    })

    it('enforces a minimum password length of 8', async () => {
        await expect(violations({ ...valid, password: '1234567' })).resolves.toEqual(['password'])
        await expect(violations({ ...valid, password: '12345678' })).resolves.toEqual([])
    })
})
