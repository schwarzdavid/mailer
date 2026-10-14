import { describe, expect, it } from 'vitest'
import { loginThrottleTracker } from './auth.constants.js'

describe('loginThrottleTracker', () => {
    it('tracks attempts per client address and normalized account', () => {
        expect(loginThrottleTracker({ ip: '203.0.113.7', body: { email: ' Grace@Example.com ' } })).toBe(
            '203.0.113.7|grace@example.com',
        )
    })

    it('shares one bucket for every attempt without a usable email', () => {
        expect(loginThrottleTracker({ ip: '203.0.113.7', body: { email: 42 } })).toBe('203.0.113.7|')
        expect(loginThrottleTracker({ ip: '203.0.113.7', body: undefined })).toBe('203.0.113.7|')
    })

    it('separates different accounts from the same address', () => {
        expect(loginThrottleTracker({ ip: '203.0.113.7', body: { email: 'a@example.com' } })).not.toBe(
            loginThrottleTracker({ ip: '203.0.113.7', body: { email: 'b@example.com' } }),
        )
    })
})
