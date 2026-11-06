import { describe, expect, it } from 'vitest'
import { FORM_KEY_LENGTH, generateFormKey } from './form-key.js'

describe('generateFormKey', () => {
    it('returns a url-safe key of the column length', () => {
        const key = generateFormKey()

        expect(key).toHaveLength(FORM_KEY_LENGTH)
        expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('returns a different key on every call', () => {
        const keys = new Set(Array.from({ length: 100 }, () => generateFormKey()))

        expect(keys.size).toBe(100)
    })
})
