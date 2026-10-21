import type { ExecutionContext } from '@nestjs/common'
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js'
import { describe, expect, it } from 'vitest'
import { FormThrottle, formThrottleKind, formThrottleTracker } from './form-throttle.js'

class Probe {
    @FormThrottle('submit')
    submit(this: void): void {}

    @FormThrottle('token')
    token(this: void): void {}

    plain(this: void): void {}
}

function contextFor(handler: () => void): ExecutionContext {
    return new ExecutionContextHost([], Probe, handler)
}

describe('formThrottleTracker', () => {
    it('keys the budget by slug and ip', () => {
        expect(formThrottleTracker({ ip: '1.2.3.4', params: { slug: 'kontakt' } })).toBe('form:kontakt:1.2.3.4')
    })

    it('separates slugs for the same ip', () => {
        const first = formThrottleTracker({ ip: '1.2.3.4', params: { slug: 'a' } })
        const second = formThrottleTracker({ ip: '1.2.3.4', params: { slug: 'b' } })

        expect(first).not.toBe(second)
    })

    it('falls back to unknown parts', () => {
        expect(formThrottleTracker({})).toBe('form:unknown:unknown')
    })
})

describe('formThrottleKind', () => {
    it('reads the kind from the handler', () => {
        expect(formThrottleKind(contextFor(Probe.prototype.submit))).toBe('submit')
        expect(formThrottleKind(contextFor(Probe.prototype.token))).toBe('token')
    })

    it('returns null for an undecorated handler', () => {
        expect(formThrottleKind(contextFor(Probe.prototype.plain))).toBeNull()
    })
})
