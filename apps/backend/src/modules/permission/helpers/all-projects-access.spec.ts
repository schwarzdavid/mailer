import { describe, expect, it } from 'vitest'
import { hasAllProjectsGrant } from './all-projects-access.js'
import { UserWithRole } from '../../user/interfaces/user.interface.js'
import { AllProjectsGrants } from '../interfaces/project-member.interface.js'
import { RoleType } from '../permission.constants.js'

function user(userId: number, roleId: number, type: RoleType = 'user'): UserWithRole {
    return {
        userId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        roleId,
        role: {
            roleId,
            name: 'Role',
            scope: 'global',
            type,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}

const grants: AllProjectsGrants = { roleIds: [2], userIds: [9] }

describe('hasAllProjectsGrant', () => {
    it('covers super admins regardless of grants', () => {
        expect(hasAllProjectsGrant(user(1, 1, 'super_admin'), { roleIds: [], userIds: [] })).toBe(true)
    })

    it('covers projects.all granted through the role or directly', () => {
        expect(hasAllProjectsGrant(user(5, 2), grants)).toBe(true)
        expect(hasAllProjectsGrant(user(9, 3), grants)).toBe(true)
    })

    it('is false for everyone else', () => {
        expect(hasAllProjectsGrant(user(5, 3), grants)).toBe(false)
    })
})
