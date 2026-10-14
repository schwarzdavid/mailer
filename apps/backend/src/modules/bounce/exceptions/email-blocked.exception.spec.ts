import { describe, expect, it } from 'vitest'
import { EmailBlockedException } from './email-blocked.exception.js'

describe('EmailBlockedException', () => {
    const blockedUntil = new Date('2026-07-20T12:00:00.000Z')
    const exception = new EmailBlockedException('user@example.com', blockedUntil)

    it('carries the blocked address and expiry for callers to inspect', () => {
        expect(exception.emailAddress).toBe('user@example.com')
        expect(exception.blockedUntil).toBe(blockedUntil)
    })

    it('is a named Error with a descriptive message', () => {
        expect(exception).toBeInstanceOf(Error)
        expect(exception.name).toBe('EmailBlockedException')
        expect(exception.message).toBe('Recipient user@example.com is blocked until 2026-07-20T12:00:00.000Z')
    })
})
