import { describe, expect, it } from 'vitest'
import { safeRedirect } from '../safeRedirect.ts'

describe('safeRedirect', () => {
    it.each(['/domains', '/users/3?tab=permissions', '/projects#forms'])('accepts the internal path %s', (path) => {
        expect(safeRedirect(path)).toBe(path)
    })

    it.each([
        ['an absolute url', 'https://evil.example.com'],
        ['a protocol-relative url', '//evil.example.com'],
        ['a backslash trick', '/\\evil.example.com'],
        ['a javascript url', 'javascript:alert(1)'],
        ['a relative path', 'domains'],
        ['an empty string', ''],
        ['a repeated query parameter', ['/domains', '/users']],
        ['a missing parameter', undefined],
    ])('rejects %s', (_, target) => {
        expect(safeRedirect(target)).toBeUndefined()
    })
})
