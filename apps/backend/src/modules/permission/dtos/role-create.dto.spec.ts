import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { RoleCreateDto, RoleUpdateDto } from './role-create.dto.js'

async function violations(type: new () => object, plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(type, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe('RoleCreateDto', () => {
    const valid = { name: 'Reviewer', scope: 'project', permissions: ['read', 'forms.manage'] }

    it('accepts a role with and without a description', async () => {
        await expect(violations(RoleCreateDto, valid)).resolves.toEqual([])
        await expect(violations(RoleCreateDto, { ...valid, description: 'Reviews forms' })).resolves.toEqual([])
        await expect(violations(RoleCreateDto, { ...valid, description: null })).resolves.toEqual([])
    })

    it('requires name, scope and permissions', async () => {
        await expect(violations(RoleCreateDto, {})).resolves.toEqual(['name', 'scope', 'permissions'])
    })

    it('limits the name to 100 and the description to 255 characters', async () => {
        await expect(
            violations(RoleCreateDto, { ...valid, name: 'x'.repeat(101), description: 'y'.repeat(256) }),
        ).resolves.toEqual(['name', 'description'])
    })

    it.each([['owner'], ['manage'], ['users.impersonate']])('rejects unknown permission %s', async (permission) => {
        await expect(violations(RoleCreateDto, { ...valid, permissions: [permission] })).resolves.toEqual([
            'permissions',
        ])
    })

    it('rejects unknown scopes', async () => {
        await expect(violations(RoleCreateDto, { ...valid, scope: 'team' })).resolves.toEqual(['scope'])
    })
})

describe('RoleUpdateDto', () => {
    it('accepts an empty patch', async () => {
        await expect(violations(RoleUpdateDto, {})).resolves.toEqual([])
    })

    it('applies the create rules to the fields it carries', async () => {
        await expect(
            violations(RoleUpdateDto, { name: '', description: 'y'.repeat(256), permissions: 'read' }),
        ).resolves.toEqual(['name', 'description', 'permissions'])
    })

    it('rejects null name and null permissions on update', async () => {
        await expect(violations(RoleUpdateDto, { name: null, description: null, permissions: null })).resolves.toEqual([
            'name',
            'permissions',
        ])
    })
})
