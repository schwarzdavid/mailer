import { describe, expect, it } from 'vitest'
import { hashApiKey } from './api-key-format.js'
import { extractApiKey, publicApiThrottleTracker } from './extract-api-key.js'

const key = `sdm_abcdEFGH_${'a'.repeat(43)}`

describe('extractApiKey', () => {
    it('reads a bearer token from the authorization header', () => {
        expect(extractApiKey({ headers: { authorization: `Bearer ${key}` }, query: {} })).toBe(key)
    })

    it('reads the key query parameter', () => {
        expect(extractApiKey({ headers: {}, query: { key } })).toBe(key)
    })

    it('prefers the header when both are present', () => {
        expect(extractApiKey({ headers: { authorization: `Bearer ${key}` }, query: { key: 'other' } })).toBe(key)
    })

    it('ignores non-bearer authorization and non-string query values', () => {
        expect(extractApiKey({ headers: { authorization: `Basic ${key}` }, query: { key: ['a', 'b'] } })).toBeNull()
    })
})

describe('publicApiThrottleTracker', () => {
    it('tracks well-formed keys by the hash of the full key', () => {
        expect(publicApiThrottleTracker({ headers: {}, query: { key }, ip: '198.51.100.1' })).toBe(
            `api-key:${hashApiKey(key)}`,
        )
    })

    it('gives keys with the same prefix but different secrets different trackers', () => {
        const forgedKey = `sdm_abcdEFGH_${'b'.repeat(43)}`

        expect(publicApiThrottleTracker({ headers: {}, query: { key } })).not.toBe(
            publicApiThrottleTracker({ headers: {}, query: { key: forgedKey } }),
        )
    })

    it('never exposes the raw key in the tracker', () => {
        const tracker = publicApiThrottleTracker({ headers: {}, query: { key } })

        expect(tracker).not.toContain('a'.repeat(43))
        expect(tracker).not.toContain('sdm_abcdEFGH')
    })

    it('falls back to the client ip for missing or malformed keys', () => {
        expect(publicApiThrottleTracker({ headers: {}, query: { key: 'junk' }, ip: '198.51.100.1' })).toBe(
            'api-key-ip:198.51.100.1',
        )
        expect(publicApiThrottleTracker({ headers: {}, query: {} })).toBe('api-key-ip:unknown')
    })
})
