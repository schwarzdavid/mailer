import { describe, expect, it } from 'vitest'
import { normalizeHostname } from './hostname.js'

describe('normalizeHostname', () => {
    it.each([
        ['Kunde.AT ', 'kunde.at'],
        ['www.kunde.at', 'www.kunde.at'],
        ['localhost', 'localhost'],
    ])('normalizes %s', (input, expected) => expect(normalizeHostname(input)).toBe(expected))

    it.each(['https://kunde.at', 'kunde.at:8080', 'kunde.at/path', '*.kunde.at', '-a.at', '', 'a..at'])(
        'rejects %s',
        (input) => expect(normalizeHostname(input)).toBeNull(),
    )

    it('rejects names longer than 253 characters', () => {
        const label = 'a'.repeat(60)
        expect(normalizeHostname([label, label, label, label, label].join('.'))).toBeNull()
    })
})
