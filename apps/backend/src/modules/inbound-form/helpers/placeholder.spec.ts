import { describe, expect, it } from 'vitest'
import { parsePlaceholder } from './placeholder'

describe('parsePlaceholder', () => {
    it('extracts the field key from a placeholder', () => {
        expect(parsePlaceholder('{{email}}')).toBe('email')
    })

    it('tolerates inner whitespace', () => {
        expect(parsePlaceholder('{{ email }}')).toBe('email')
    })

    it('returns null for a literal email address', () => {
        expect(parsePlaceholder('owner@business.com')).toBeNull()
    })

    it('returns null when the placeholder is embedded in other text', () => {
        expect(parsePlaceholder('prefix {{email}}')).toBeNull()
    })
})
