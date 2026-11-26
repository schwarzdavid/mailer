import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MailerError } from '../core/mailer-error.ts'
import { MailerForm, type MailerFormOptions } from './mailer-form.ts'

const baseUrl = 'https://api.example.com'
const tokenUrl = 'https://api.example.com/api/v1/forms/kontakt/token'
const submitUrl = 'https://api.example.com/api/v1/forms/kontakt'
const notBefore = '2026-11-17T10:00:00.000Z'
const expiresAt = '2026-11-17T10:01:00.000Z'

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function tokenResponse(token: string, waitMs: number): Response {
    return jsonResponse(200, { token, notBefore, expiresAt, waitMs })
}

function acceptedResponse(): Response {
    return jsonResponse(202, { status: 'accepted' })
}

function tracked<T>(promise: Promise<T>): { settled: () => boolean; promise: Promise<T> } {
    let settled = false
    const observed = promise.then(
        (value) => {
            settled = true
            return value
        },
        (error: unknown) => {
            settled = true
            throw error
        },
    )
    return { settled: () => settled, promise: observed }
}

describe('MailerForm', () => {
    let fetchMock: Mock<typeof fetch>
    let tokens: string[]
    let waitMs: number
    let submitResponses: Response[]

    function createForm(overrides: Partial<MailerFormOptions> = {}): MailerForm {
        return new MailerForm({
            baseUrl,
            formKey: 'kontakt',
            fetch: fetchMock,
            timedToken: { key: 'formToken', location: 'body' },
            ...overrides,
        })
    }

    function tokenCalls(): number {
        return fetchMock.mock.calls.filter(([url]) => url === tokenUrl).length
    }

    function submitCalls(): [string, RequestInit][] {
        const calls: [string, RequestInit][] = []
        for (const [url, init] of fetchMock.mock.calls) {
            if (typeof url === 'string' && url.startsWith(submitUrl) && !url.includes('/token')) {
                calls.push([url, init ?? {}])
            }
        }
        return calls
    }

    function sentBody(index: number): { data: unknown; security?: Record<string, unknown> } {
        const body = submitCalls()[index]?.[1].body
        if (typeof body !== 'string') {
            throw new Error('no string body sent')
        }
        return JSON.parse(body) as { data: unknown; security?: Record<string, unknown> }
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
        vi.setSystemTime(new Date('2026-11-17T10:00:00.000Z'))
        tokens = ['t1', 't2', 't3']
        waitMs = 1000
        submitResponses = []
        fetchMock = vi.fn<typeof fetch>((input) => {
            if (input === tokenUrl) {
                return Promise.resolve(tokenResponse(tokens.shift() ?? 'tx', waitMs))
            }
            return Promise.resolve(submitResponses.shift() ?? acceptedResponse())
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('exposes the form key', () => {
        expect(createForm().formKey).toBe('kontakt')
    })

    it('rejects a relative baseUrl in the constructor', () => {
        expect(() => createForm({ baseUrl: '/relative' })).toThrow(TypeError)
    })

    it('does not request a token in the constructor', () => {
        createForm()

        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('without timedToken submits without any token request', async () => {
        const form = createForm({ timedToken: undefined })

        form.prepare()
        const result = await form.submit({ data: { email: 'a@example.com' } })

        expect(result).toEqual({ status: 'accepted' })
        expect(tokenCalls()).toBe(0)
        expect(submitCalls()).toHaveLength(1)
        expect(sentBody(0)).toEqual({ data: { email: 'a@example.com' } })
    })

    it('prepare fetches once and submit reuses that token', async () => {
        const form = createForm()

        form.prepare()
        form.prepare()
        await vi.advanceTimersByTimeAsync(1000)
        await form.submit({ data: {} })

        expect(tokenCalls()).toBe(1)
        expect(sentBody(0).security).toEqual({ formToken: 't1' })
    })

    it('submit fetches the token itself when prepare was not called', async () => {
        const form = createForm()

        const result = tracked(form.submit({ data: {} }))
        await vi.advanceTimersByTimeAsync(999)
        expect(result.settled()).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await result.promise

        expect(tokenCalls()).toBe(1)
        expect(sentBody(0).security).toEqual({ formToken: 't1' })
    })

    it('places the token in the body', async () => {
        const form = createForm({ timedToken: { key: 'formToken', location: 'body' } })

        const result = form.submit({ data: { a: 1 }, security: { website: '' } })
        await vi.advanceTimersByTimeAsync(1000)
        await result

        expect(sentBody(0)).toEqual({ data: { a: 1 }, security: { website: '', formToken: 't1' } })
    })

    it('replaces a caller header of the same name in any case', async () => {
        const form = createForm({ timedToken: { key: 'x-form-token', location: 'header' } })

        const result = form.submit({ data: {}, headers: { 'X-Form-Token': 'stale', 'x-other': 'o' } })
        await vi.runAllTimersAsync()
        await result

        const headers = submitCalls()[0]?.[1].headers as Record<string, string>
        expect(Object.keys(headers).filter((name) => name.toLowerCase() === 'x-form-token')).toEqual(['x-form-token'])
        expect(headers['x-form-token']).toBe('t1')
        expect(headers['x-other']).toBe('o')
    })

    it('places the token in a header', async () => {
        const form = createForm({ timedToken: { key: 'x-form-token', location: 'header' } })

        const result = form.submit({ data: {}, headers: { 'x-other': 'o' } })
        await vi.advanceTimersByTimeAsync(1000)
        await result

        expect(submitCalls()[0]?.[1].headers).toMatchObject({ 'x-form-token': 't1', 'x-other': 'o' })
        expect(sentBody(0).security).toBeUndefined()
    })

    it('places the token in the query', async () => {
        const form = createForm({ timedToken: { key: 'formToken', location: 'query' } })

        const result = form.submit({ data: {}, query: { ref: 'r' } })
        await vi.advanceTimersByTimeAsync(1000)
        await result

        const url = new URL(submitCalls()[0]?.[0] ?? '')
        expect(url.searchParams.get('formToken')).toBe('t1')
        expect(url.searchParams.get('ref')).toBe('r')
    })

    it('replaces a caller value under the token key', async () => {
        const form = createForm()

        const result = form.submit({ data: {}, security: { formToken: 'forged' } })
        await vi.advanceTimersByTimeAsync(1000)
        await result

        expect(sentBody(0).security).toEqual({ formToken: 't1' })
    })

    it('drops the token after 202', async () => {
        const form = createForm()

        form.prepare()
        await vi.advanceTimersByTimeAsync(1000)
        await form.submit({ data: {} })
        const second = form.submit({ data: {} })
        await vi.advanceTimersByTimeAsync(1000)
        await second

        expect(tokenCalls()).toBe(2)
        expect(sentBody(0).security).toEqual({ formToken: 't1' })
        expect(sentBody(1).security).toEqual({ formToken: 't2' })
    })

    it.each([403, 500, 503])('drops the token after %i', async (status) => {
        const form = createForm()
        submitResponses.push(jsonResponse(status, {}))

        form.prepare()
        await vi.advanceTimersByTimeAsync(1000)
        await expect(form.submit({ data: {} })).rejects.toMatchObject({ status })
        const second = form.submit({ data: {} })
        await vi.advanceTimersByTimeAsync(1000)
        await second

        expect(tokenCalls()).toBe(2)
        expect(sentBody(1).security).toEqual({ formToken: 't2' })
    })

    it('drops the token when the submit request fails without a response', async () => {
        const form = createForm()
        let failNextSubmit = true
        fetchMock.mockImplementation((input) => {
            if (input === tokenUrl) {
                return Promise.resolve(tokenResponse(tokens.shift() ?? 'tx', waitMs))
            }
            if (failNextSubmit) {
                failNextSubmit = false
                return Promise.reject(new TypeError('Failed to fetch'))
            }
            return Promise.resolve(acceptedResponse())
        })

        form.prepare()
        await vi.advanceTimersByTimeAsync(1000)
        await expect(form.submit({ data: {} })).rejects.toMatchObject({ status: 0 })
        const second = form.submit({ data: {} })
        await vi.advanceTimersByTimeAsync(1000)
        await second

        expect(tokenCalls()).toBe(2)
        expect(sentBody(1).security).toEqual({ formToken: 't2' })
    })

    it.each([400, 404, 413, 429])('keeps the token after %i', async (status) => {
        const form = createForm()
        submitResponses.push(jsonResponse(status, {}))

        form.prepare()
        await vi.advanceTimersByTimeAsync(1000)
        await expect(form.submit({ data: {} })).rejects.toMatchObject({ status })
        await form.submit({ data: {} })

        expect(tokenCalls()).toBe(1)
        expect(sentBody(0).security).toEqual({ formToken: 't1' })
        expect(sentBody(1).security).toEqual({ formToken: 't1' })
    })

    it('concurrent submits use different tokens', async () => {
        const form = createForm()

        const first = form.submit({ data: {} })
        const second = form.submit({ data: {} })
        await vi.advanceTimersByTimeAsync(1000)
        await Promise.all([first, second])

        expect(tokenCalls()).toBe(2)
        const sent = [sentBody(0).security?.formToken, sentBody(1).security?.formToken]
        expect(new Set(sent)).toEqual(new Set(['t1', 't2']))
    })

    it('a failed prepare surfaces on submit', async () => {
        const unhandled = vi.fn<(reason: unknown) => void>()
        process.on('unhandledRejection', unhandled)
        fetchMock.mockImplementation((input) => {
            if (input === tokenUrl) {
                return Promise.resolve(jsonResponse(429, {}))
            }
            return Promise.resolve(acceptedResponse())
        })
        const form = createForm()

        try {
            form.prepare()
            await vi.advanceTimersByTimeAsync(0)
            await new Promise<void>((resolve) => setImmediate(resolve))

            expect(unhandled).not.toHaveBeenCalled()
            expect(tokenCalls()).toBe(1)

            const failure: unknown = await form.submit({ data: {} }).catch((error: unknown) => error)

            expect(tokenCalls()).toBe(2)
            expect(failure).toBeInstanceOf(MailerError)
            expect(failure).toMatchObject({ status: 429, retryable: true })
            expect(unhandled).not.toHaveBeenCalled()
        } finally {
            process.off('unhandledRejection', unhandled)
        }
    })

    it('replaces an expired cached token', async () => {
        const form = createForm()

        form.prepare()
        await vi.advanceTimersByTimeAsync(1000)
        await vi.advanceTimersByTimeAsync(57_000)
        const result = form.submit({ data: {} })
        await vi.advanceTimersByTimeAsync(1000)
        await result

        expect(tokenCalls()).toBe(2)
        expect(sentBody(0).security).toEqual({ formToken: 't2' })
    })

    it('keeps a token prepared during a submit when that submit answers 400', async () => {
        const form = createForm()
        submitResponses.push(jsonResponse(400, {}))

        const first = form.submit({ data: {} })
        const firstOutcome = first.catch((error: unknown) => error)
        form.prepare()
        await vi.advanceTimersByTimeAsync(1000)
        await expect(firstOutcome).resolves.toMatchObject({ status: 400 })
        await form.submit({ data: {} })

        expect(tokenCalls()).toBe(2)
        expect(sentBody(0).security).toEqual({ formToken: 't1' })
        expect(sentBody(1).security).toEqual({ formToken: 't2' })
    })

    it('treats a token with unparseable dates as non-expiring', async () => {
        fetchMock.mockImplementation((input) => {
            if (input === tokenUrl) {
                return Promise.resolve(
                    jsonResponse(200, { token: tokens.shift() ?? 'tx', notBefore: 'x', expiresAt: 'y', waitMs: 0 }),
                )
            }
            return Promise.resolve(acceptedResponse())
        })
        const form = createForm()

        form.prepare()
        await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
        await form.submit({ data: {} })

        expect(tokenCalls()).toBe(1)
        expect(sentBody(0).security).toEqual({ formToken: 't1' })
    })

    it('keeps a cached token that is not yet expired', async () => {
        const form = createForm()

        form.prepare()
        await vi.advanceTimersByTimeAsync(1000)
        await vi.advanceTimersByTimeAsync(50_000)
        await form.submit({ data: {} })

        expect(tokenCalls()).toBe(1)
        expect(sentBody(0).security).toEqual({ formToken: 't1' })
    })

    it('submit rejects with the submit error', async () => {
        submitResponses.push(jsonResponse(404, {}))
        const form = createForm({ timedToken: undefined })

        const failure: unknown = await form.submit({ data: {} }).catch((error: unknown) => error)

        expect(failure).toBeInstanceOf(MailerError)
        expect(failure).toMatchObject({ status: 404 })
    })
})
