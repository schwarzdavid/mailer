import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitAtleast } from '../waitAtleast.ts'

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

function track<T>(promise: Promise<T>) {
    const state: { settled: boolean; value?: T; error?: unknown } = { settled: false }
    promise.then(
        (value) => {
            state.settled = true
            state.value = value
        },
        (error: unknown) => {
            state.settled = true
            state.error = error
        },
    )
    return state
}

describe('waitAtleast', () => {
    it('holds back a fast result until the default minimum of one second', async () => {
        const state = track(waitAtleast(Promise.resolve('done')))

        await vi.advanceTimersByTimeAsync(999)
        expect(state.settled).toBe(false)

        await vi.advanceTimersByTimeAsync(1)
        expect(state.settled).toBe(true)
        expect(state.value).toBe('done')
    })

    it('honors a custom minimum duration', async () => {
        const state = track(waitAtleast(Promise.resolve(7), 2000))

        await vi.advanceTimersByTimeAsync(1999)
        expect(state.settled).toBe(false)

        await vi.advanceTimersByTimeAsync(1)
        expect(state.value).toBe(7)
    })

    it('resolves as soon as a slow result arrives after the minimum', async () => {
        const slow = new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 3000))
        const state = track(waitAtleast(slow))

        await vi.advanceTimersByTimeAsync(2999)
        expect(state.settled).toBe(false)

        await vi.advanceTimersByTimeAsync(1)
        expect(state.value).toBe('slow')
    })

    it('propagates a rejection without waiting for the minimum', async () => {
        const failure = new Error('boom')
        const state = track(waitAtleast(Promise.reject(failure)))

        await vi.advanceTimersByTimeAsync(0)
        expect(state.settled).toBe(true)
        expect(state.error).toBe(failure)
    })
})
