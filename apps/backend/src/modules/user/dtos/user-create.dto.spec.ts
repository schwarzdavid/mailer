import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { UserCreateDto, UserPermissionsPutDto, UserUpdateDto } from './user-create.dto.js'
import { GLOBAL_PERMISSIONS } from '../../permission/permission.constants.js'

async function violations(type: new () => object, plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(type, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe('UserCreateDto', () => {
    const valid = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'correct-horse',
        roleId: 3,
    }

    it('accepts a user with and without extra permissions', async () => {
        await expect(violations(UserCreateDto, valid)).resolves.toEqual([])
        await expect(violations(UserCreateDto, { ...valid, permissions: ['domains.read'] })).resolves.toEqual([])
    })

    it('requires names, email, password and role', async () => {
        await expect(violations(UserCreateDto, {})).resolves.toEqual([
            'firstName',
            'lastName',
            'email',
            'password',
            'roleId',
        ])
    })

    it('rejects permissions outside the global catalog', async () => {
        await expect(violations(UserCreateDto, { ...valid, permissions: ['read'] })).resolves.toEqual(['permissions'])
    })

    it('enforces a minimum password length of 8', async () => {
        await expect(violations(UserCreateDto, { ...valid, password: 'short' })).resolves.toEqual(['password'])
    })

    it('rejects an invalid email and a non-integer role', async () => {
        await expect(violations(UserCreateDto, { ...valid, email: 'ada@', roleId: '1' })).resolves.toEqual([
            'email',
            'roleId',
        ])
    })
})

describe('UserUpdateDto', () => {
    it('accepts an empty patch', async () => {
        await expect(violations(UserUpdateDto, {})).resolves.toEqual([])
    })

    it('applies the create rules to the fields it carries', async () => {
        await expect(
            violations(UserUpdateDto, { firstName: '', lastName: '', email: 'nope', password: 'short', roleId: 1.5 }),
        ).resolves.toEqual(['firstName', 'lastName', 'email', 'password', 'roleId'])
    })
})

describe('UserPermissionsPutDto', () => {
    it('accepts every global permission and an empty list', async () => {
        await expect(violations(UserPermissionsPutDto, { permissions: [...GLOBAL_PERMISSIONS] })).resolves.toEqual([])
        await expect(violations(UserPermissionsPutDto, { permissions: [] })).resolves.toEqual([])
    })

    it.each([['manage'], ['read'], ['users.read', 'users.impersonate']])(
        'rejects permissions outside the global set: %o',
        async (...permissions) => {
            await expect(violations(UserPermissionsPutDto, { permissions })).resolves.toEqual(['permissions'])
        },
    )

    it('requires an array', async () => {
        await expect(violations(UserPermissionsPutDto, { permissions: 'users.read' })).resolves.toEqual(['permissions'])
    })
})
