import { describe, expect, it } from 'vitest'
import { formValuesEqual } from '../formValuesEqual.ts'

describe('formValuesEqual', () => {
    it.each([
        ['an emptied text field', { name: undefined }, { name: '' }],
        ['a cleared select', { domainId: null }, { domainId: undefined }],
        ['a field missing from the initial values', {}, { name: '' }],
        ['an emptied list', { hostnames: [] }, { hostnames: undefined }],
        ['a number retyped into a text input', { minLength: 5 }, { minLength: '5' }],
        ['reordered keys', { a: 'x', b: true }, { b: true, a: 'x' }],
        ['nested emptied values', { config: { secret: undefined } }, { config: { secret: '' } }],
    ])('treats %s as unchanged', (_, initial, current) => {
        expect(formValuesEqual(initial, current)).toBe(true)
    })

    it.each([
        ['an edited text field', { name: 'Contact' }, { name: 'Contact form' }],
        ['a filled-in field', { name: undefined }, { name: 'a' }],
        ['a toggled checkbox', { isActive: true }, { isActive: false }],
        ['a different number', { minLength: 5 }, { minLength: '6' }],
        ['an added list entry', { hostnames: ['a.com'] }, { hostnames: ['a.com', 'b.com'] }],
        ['reordered list entries', { hostnames: ['a.com', 'b.com'] }, { hostnames: ['b.com', 'a.com'] }],
        ['a whitespace-only entry', { name: '' }, { name: ' ' }],
    ])('detects %s', (_, initial, current) => {
        expect(formValuesEqual(initial, current)).toBe(false)
    })
})
