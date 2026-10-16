import { describe, expect, it } from 'vitest'
import { zPermission, zProjectPermission } from 'api'
import {
    GLOBAL_PERMISSION_GROUPS,
    isGlobalPermission,
    isProjectPermission,
    permissionLabelKey,
    PROJECT_PERMISSION_GROUPS,
} from '../permissionCatalog.ts'
import { ALL_PERMISSIONS, ALL_PROJECT_PERMISSIONS } from './roleFixtures.ts'
import en from '@/locales/en.json'

const globalGrouped = Object.values(GLOBAL_PERMISSION_GROUPS).flat()
const projectGrouped = Object.values(PROJECT_PERMISSION_GROUPS).flat()

describe('permission catalog', () => {
    it('groups every global and project permission exactly once', () => {
        expect([...globalGrouped].sort()).toEqual([...ALL_PERMISSIONS].sort())
        expect([...projectGrouped].sort()).toEqual([...ALL_PROJECT_PERMISSIONS].sort())
    })

    it('covers every permission the API knows', () => {
        expect([...globalGrouped].sort()).toEqual([...zPermission.options].sort())
        expect([...projectGrouped].sort()).toEqual([...zProjectPermission.options].sort())
    })

    it('has a translated heading for every group', () => {
        for (const group of [...Object.keys(GLOBAL_PERMISSION_GROUPS), ...Object.keys(PROJECT_PERMISSION_GROUPS)]) {
            expect(en.permissions.groups).toHaveProperty(group)
        }
    })

    it('has a translated label for every permission', () => {
        for (const permission of globalGrouped) {
            expect(en.permissions.labels).toHaveProperty(permission.replace('.', '_'))
        }
        for (const permission of projectGrouped) {
            expect(en.permissions.project).toHaveProperty(permission.replace('.', '_'))
        }
    })

    it('tells global and project permissions apart', () => {
        expect(isGlobalPermission('roles.create')).toBe(true)
        expect(isGlobalPermission('forms.manage')).toBe(false)
        expect(isProjectPermission('forms.manage')).toBe(true)
        expect(isProjectPermission('users.read')).toBe(false)
    })

    it('builds i18n keys without dots inside the permission', () => {
        expect(permissionLabelKey('global', 'roles.create')).toBe('permissions.labels.roles_create')
        expect(permissionLabelKey('project', 'api_keys.manage')).toBe('permissions.project.api_keys_manage')
    })
})
