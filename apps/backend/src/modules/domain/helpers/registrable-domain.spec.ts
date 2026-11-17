import { describe, expect, it } from 'vitest'
import { registrableDomainOf } from './registrable-domain.js'

describe('registrableDomainOf', () => {
    it.each([
        ['example.com', 'example.com'],
        ['mail.example.com', 'example.com'],
        ['a.b.example.com', 'example.com'],
        ['Mail.Example.COM', 'example.com'],
        ['mail.example.co.uk', 'example.co.uk'],
        ['mail.example.com.evil.io', 'evil.io'],
    ])('resolves %s to %s', (hostname, expected) => {
        expect(registrableDomainOf(hostname)).toBe(expected)
    })

    it.each(['com', 'co.uk', ''])('has no registrable domain for %j', (hostname) => {
        expect(registrableDomainOf(hostname)).toBeNull()
    })
})
