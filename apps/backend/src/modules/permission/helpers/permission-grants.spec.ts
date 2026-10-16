import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { assertPermissionChangesHeld, assertRoleGrantable } from './permission-grants.js'
import { Permission } from '../permission.constants.js'

const holds = (held: Permission[]) => (permission: Permission) => held.includes(permission)

describe('assertPermissionChangesHeld', () => {
    it('passes when every added and removed permission is held', () => {
        expect(() =>
            assertPermissionChangesHeld(['users.read'], ['users.update'], holds(['users.read', 'users.update'])),
        ).not.toThrow()
    })

    it('ignores permissions that stay unchanged', () => {
        expect(() => assertPermissionChangesHeld(['settings.update'], ['settings.update'], holds([]))).not.toThrow()
    })

    it('names every permission the caller may not grant or revoke', () => {
        expect(() => assertPermissionChangesHeld(['users.delete'], ['settings.update'], holds(['users.read']))).toThrow(
            new ForbiddenException(
                'You cannot grant or revoke permissions you do not hold: settings.update, users.delete',
            ),
        )
    })
})

describe('assertRoleGrantable', () => {
    it('passes when every role permission is held', () => {
        expect(() =>
            assertRoleGrantable(['users.read', 'users.update'], holds(['users.read', 'users.update'])),
        ).not.toThrow()
    })

    it('rejects roles holding more than the caller', () => {
        expect(() => assertRoleGrantable(['users.read', 'roles.delete'], holds(['users.read']))).toThrow(
            new ForbiddenException('You cannot assign a role with permissions you do not hold: roles.delete'),
        )
    })
})
