import { afterEach, describe, expect, it } from 'vitest'
import { subject } from '@casl/ability'
import { ability } from '../casl.ts'

afterEach(() => {
    ability.update([])
})

describe('ability', () => {
    it('denies everything before any rules are loaded', () => {
        expect(ability.can('read', 'Domain')).toBe(false)
        expect(ability.can('manage', 'all')).toBe(false)
    })

    it('grants exactly the rules returned by the API', () => {
        ability.update([{ action: ['read', 'create'], subject: 'User' }])

        expect(ability.can('read', 'User')).toBe(true)
        expect(ability.can('create', 'User')).toBe(true)
        expect(ability.can('delete', 'User')).toBe(false)
        expect(ability.can('read', 'Domain')).toBe(false)
    })

    it('evaluates conditional rules against the subject', () => {
        ability.update([{ action: ['update'], subject: 'User', conditions: { 'role.type': { $ne: 'super_admin' } } }])

        expect(ability.can('update', subject('User', { role: { type: 'user' } }))).toBe(true)
        expect(ability.can('update', subject('User', { role: { type: 'super_admin' } }))).toBe(false)
    })

    it('revokes everything when the rules are cleared on logout', () => {
        ability.update([{ action: ['manage'], subject: 'all' }])
        ability.update([])

        expect(ability.can('read', 'Settings')).toBe(false)
    })
})
