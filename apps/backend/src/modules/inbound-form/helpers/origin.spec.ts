import { describe, expect, it } from 'vitest'
import { isOriginAllowed, requestHostname } from './origin.js'

describe('requestHostname', () => {
    it('lowercases the origin hostname and ignores the port', () => {
        expect(requestHostname({ origin: 'https://Kunde.at:8443' })).toBe('kunde.at')
    })

    it('falls back to the referer when the origin is missing', () => {
        expect(requestHostname({ referer: 'https://kunde.at/kontakt' })).toBe('kunde.at')
    })

    it('returns null for an opaque origin without a referer', () => {
        expect(requestHostname({ origin: 'null' })).toBeNull()
    })

    it('returns null when both headers are missing', () => {
        expect(requestHostname({})).toBeNull()
    })

    it('returns null for an unparseable origin', () => {
        expect(requestHostname({ origin: 'not a url' })).toBeNull()
    })

    it('does not fall back to the referer when the origin is present but opaque', () => {
        expect(requestHostname({ origin: 'null', referer: 'https://kunde.at/' })).toBeNull()
    })

    it('ignores non-string header values', () => {
        expect(requestHostname({ origin: ['https://kunde.at'] })).toBeNull()
    })
})

describe('isOriginAllowed', () => {
    it('allows everything when the list is empty', () => {
        expect(isOriginAllowed([], {})).toBe(true)
    })

    it('rejects a missing origin when the list is not empty', () => {
        expect(isOriginAllowed(['kunde.at'], {})).toBe(false)
    })

    it('rejects an opaque origin when the list is not empty', () => {
        expect(isOriginAllowed(['kunde.at'], { origin: 'null' })).toBe(false)
    })

    it('rejects a foreign origin', () => {
        expect(isOriginAllowed(['kunde.at'], { origin: 'https://evil.at' })).toBe(false)
    })

    it('rejects an opaque origin even with a listed referer', () => {
        expect(isOriginAllowed(['kunde.at'], { origin: 'null', referer: 'https://kunde.at/' })).toBe(false)
    })

    it('accepts a listed referer when the origin is absent', () => {
        expect(isOriginAllowed(['kunde.at'], { referer: 'https://kunde.at/x' })).toBe(true)
    })

    it('accepts a listed origin with port and uppercase', () => {
        expect(isOriginAllowed(['kunde.at'], { origin: 'https://Kunde.at:8443' })).toBe(true)
    })

    it('does not match subdomains', () => {
        expect(isOriginAllowed(['kunde.at'], { origin: 'https://www.kunde.at' })).toBe(false)
    })
})
