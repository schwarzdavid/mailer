import { describe, expect, it } from 'vitest'
import { FORM_KEY_LENGTH, generateFormKey, normalizeFormKey } from './form-key.js'

describe('generateFormKey', () => {
    it('returns a lowercase url-safe key of the column length', () => {
        const key = generateFormKey()

        expect(key).toHaveLength(FORM_KEY_LENGTH)
        expect(key).toMatch(/^[a-z0-9]+$/)
    })

    it('returns a different key on every call', () => {
        const keys = new Set(Array.from({ length: 100 }, () => generateFormKey()))

        expect(keys.size).toBe(100)
    })
})

describe('normalizeFormKey', () => {
    it('lowercases the key so every casing of a url addresses the same form', () => {
        expect(normalizeFormKey('3F9A0bC1')).toBe('3f9a0bc1')
    })

    it('keeps a generated key unchanged', () => {
        const key = generateFormKey()

        expect(normalizeFormKey(key)).toBe(key)
    })
})
