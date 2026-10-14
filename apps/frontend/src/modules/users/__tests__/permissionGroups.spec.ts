import { describe, expect, it } from 'vitest'
import { zPermission } from 'api'
import { PERMISSION_GROUPS } from '../permissionGroups.ts'
import en from '@/locales/en.json'

const grouped = Object.values(PERMISSION_GROUPS).flat()

describe('PERMISSION_GROUPS', () => {
    it('exposes every permission the API knows', () => {
        expect([...grouped].sort()).toEqual([...zPermission.options].sort())
    })

    it('lists each permission only once', () => {
        expect(new Set(grouped).size).toBe(grouped.length)
    })

    it('has a translated heading for every group', () => {
        for (const group of Object.keys(PERMISSION_GROUPS)) {
            expect(en.permissions.groups).toHaveProperty(group)
        }
    })

    it('has a translated label for every permission', () => {
        for (const permission of grouped) {
            expect(en.permissions.labels).toHaveProperty(permission.replace('.', '_'))
        }
    })
})
