import { createMongoAbility } from '@casl/ability'
import { describe, expect, it } from 'vitest'
import {
    heldPermissions,
    heldProjectPermissionsEverywhere,
    holdsPermission,
    holdsProjectPermissionEverywhere,
    holdsRolePermission,
} from './holds-permission.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS } from '../permission.constants.js'

const superAdmin = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const allProjects = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Domain' },
    ...PROJECT_PERMISSIONS.map((permission) => ({ action: permission, subject: 'Project' as const })),
])
const member = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'read', subject: 'User' },
    { action: 'update', subject: 'User', conditions: { 'role.type': 'super_admin' }, inverted: true },
])

describe('holdsPermission', () => {
    it('is true for unconditional rules and manage-all', () => {
        expect(holdsPermission(superAdmin, 'roles.delete')).toBe(true)
        expect(holdsPermission(allProjects, 'domains.read')).toBe(true)
        expect(holdsPermission(allProjects, 'projects.all')).toBe(true)
    })

    it('ignores conditional and inverted rules', () => {
        expect(holdsPermission(member, 'users.read')).toBe(true)
        expect(holdsPermission(member, 'users.update')).toBe(false)
        expect(holdsPermission(member, 'projects.all')).toBe(false)
    })
})

describe('holdsProjectPermissionEverywhere', () => {
    it('only counts unconditional project rules', () => {
        expect(holdsProjectPermissionEverywhere(superAdmin, 'delete')).toBe(true)
        expect(holdsProjectPermissionEverywhere(allProjects, 'members.manage')).toBe(true)
        expect(holdsProjectPermissionEverywhere(member, 'forms.manage')).toBe(false)
    })
})

describe('held permission lists', () => {
    it('lists the whole catalog for super admins', () => {
        expect(heldPermissions(superAdmin)).toEqual([...GLOBAL_PERMISSIONS])
        expect(heldProjectPermissionsEverywhere(superAdmin)).toEqual([...PROJECT_PERMISSIONS])
    })

    it('lists only what is held unconditionally, in catalog order', () => {
        expect(heldPermissions(member)).toEqual(['users.read'])
        expect(heldProjectPermissionsEverywhere(member)).toEqual([])
        expect(heldProjectPermissionsEverywhere(allProjects)).toEqual([...PROJECT_PERMISSIONS])
    })
})

describe('holdsRolePermission', () => {
    it('routes global and project permissions to the matching check', () => {
        expect(holdsRolePermission(allProjects, 'global', 'domains.read')).toBe(true)
        expect(holdsRolePermission(allProjects, 'project', 'delete')).toBe(true)
        expect(holdsRolePermission(member, 'project', 'forms.manage')).toBe(false)
    })

    it('rejects permissions that do not belong to the scope', () => {
        expect(holdsRolePermission(superAdmin, 'global', 'forms.manage')).toBe(false)
        expect(holdsRolePermission(superAdmin, 'project', 'domains.read')).toBe(false)
    })
})
