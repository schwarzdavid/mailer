import { describe, expect, it } from 'vitest'
import { toUserWithRole, userWithRoleFromRow, type UserRow } from './user.mapper.js'
import type { Role } from '../../permission/interfaces/role.interface.js'
import type { FullUser, UserWithRole } from '../interfaces/user.interface.js'

const role: Role = { roleId: 2, name: 'Admin', type: 'admin', createdAt: new Date(), updatedAt: new Date() }

const user: UserWithRole = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 2,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const fullRow: FullUser & { role: Role & { permissions: string[] }; extra: string } = {
    ...user,
    password: '$2a$10$hash',
    role: { ...role, permissions: ['domains.read'] },
    extra: 'leak',
}

describe('user mapper', () => {
    it('projects a user with its role onto the public fields only', () => {
        expect(toUserWithRole(fullRow)).toEqual(user)
    })

    it('strips the password hash from a model row', () => {
        const row: UserRow = { get: () => fullRow }

        const result = userWithRoleFromRow(row)

        expect(result).toEqual(user)
        expect(result).not.toHaveProperty('password')
    })
})
