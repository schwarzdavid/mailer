import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MailerError } from '../core/mailer-error.ts'
import { createFormClient } from './form-client.ts'
import { createFormClientInternal } from './form-client-internal.ts'

const baseUrl = 'https://api.example.com'
const tokenUrl = 'https://api.example.com/api/v1/forms/kontakt/token'
const submitUrl = 'https://api.example.com/api/v1/forms/kontakt'
const notBefore = '2026-11-17T10:00:00.000Z'
const expiresAt = '2026-11-17T10:30:00.000Z'

function tokenResponse(token: string, waitMs: number): Response {
    return new Response(JSON.stringify({ token, notBefore, expiresAt, waitMs }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })
}

function acceptedResponse(): Response {
    return new Response(JSON.stringify({ status: 'accepted' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
    })
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

describe('createFormClient', () => {
    let fetchMock: Mock<typeof fetch>

    beforeEach(() => {
        fetchMock = vi.fn<typeof fetch>()
    })

    describe('token', () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it('fetches lazily and waits the remaining delay', async () => {
            fetchMock.mockResolvedValueOnce(tokenResponse('t1', 1500))
            const client = createFormClient({ baseUrl, fetch: fetchMock })

            expect(fetchMock).not.toHaveBeenCalled()

            const result = tracked(client.getToken('kontakt'))

            expect(fetchMock).toHaveBeenCalledWith(
                tokenUrl,
                expect.objectContaining({ method: 'POST', credentials: 'omit' }),
            )
            await vi.advanceTimersByTimeAsync(1499)
            expect(result.settled()).toBe(false)
            await vi.advanceTimersByTimeAsync(1)
            await expect(result.promise).resolves.toBe('t1')
        })

        it('reuses an in-flight token request', async () => {
            fetchMock.mockResolvedValueOnce(tokenResponse('t1', 1500))
            const client = createFormClient({ baseUrl, fetch: fetchMock })

            const prefetch = client.getToken('kontakt')
            await vi.advanceTimersByTimeAsync(500)
            const atSubmit = client.getToken('kontakt')
            await vi.advanceTimersByTimeAsync(1000)

            await expect(prefetch).resolves.toBe('t1')
            await expect(atSubmit).resolves.toBe('t1')
            expect(fetchMock).toHaveBeenCalledTimes(1)
        })

        it('hands each token out once', async () => {
            fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0)).mockResolvedValueOnce(tokenResponse('t2', 0))
            const client = createFormClient({ baseUrl, fetch: fetchMock })

            const first = client.getToken('kontakt')
            await vi.runAllTimersAsync()
            await expect(first).resolves.toBe('t1')

            const second = client.getToken('kontakt')
            await vi.runAllTimersAsync()
            await expect(second).resolves.toBe('t2')

            expect(fetchMock).toHaveBeenCalledTimes(2)
        })

        it('rejects with the status', async () => {
            fetchMock
                .mockResolvedValueOnce(new Response('{}', { status: 404 }))
                .mockResolvedValueOnce(tokenResponse('t1', 0))
            const client = createFormClient({ baseUrl, fetch: fetchMock })

            const failure: unknown = await client.getToken('kontakt').catch((error: unknown) => error)

            expect(failure).toBeInstanceOf(MailerError)
            expect(failure).toHaveProperty('status', 404)

            const retry = client.getToken('kontakt')
            await vi.runAllTimersAsync()
            await expect(retry).resolves.toBe('t1')
            expect(fetchMock).toHaveBeenCalledTimes(2)
        })

        it('encodes the form key in the token url', async () => {
            fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0))
            const client = createFormClient({ baseUrl, fetch: fetchMock })

            const token = client.getToken('a b/c')
            await vi.runAllTimersAsync()

            await expect(token).resolves.toBe('t1')
            expect(fetchMock).toHaveBeenCalledWith(
                'https://api.example.com/api/v1/forms/a%20b%2Fc/token',
                expect.anything(),
            )
        })

        it('parses notBefore and expiresAt', async () => {
            fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0))
            const client = createFormClientInternal({ baseUrl, fetch: fetchMock })

            const issued = client.issueToken('kontakt')
            await vi.runAllTimersAsync()
            const result = await issued

            expect(result.token).toBe('t1')
            expect(result.notBefore).toEqual(new Date(notBefore))
            expect(result.expiresAt).toEqual(new Date(expiresAt))
            expect(result.waitMs).toBe(0)
            expect(typeof result.receivedAt).toBe('number')
        })

        it('issueToken makes a fresh request on every call', async () => {
            fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0)).mockResolvedValueOnce(tokenResponse('t2', 0))
            const client = createFormClientInternal({ baseUrl, fetch: fetchMock })

            const first = client.issueToken('kontakt')
            const second = client.issueToken('kontakt')
            await vi.runAllTimersAsync()

            expect((await first).token).toBe('t1')
            expect((await second).token).toBe('t2')
            expect(fetchMock).toHaveBeenCalledTimes(2)
        })
    })

    it('does not let the timeout cover the token wait', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 200))
        const client = createFormClient({ baseUrl, fetch: fetchMock, timeoutMs: 50 })

        const startedAt = Date.now()
        const token = await client.getToken('kontakt')

        expect(token).toBe('t1')
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(190)
    })

    describe('submit', () => {
        function lastInit(): RequestInit {
            const init = fetchMock.mock.calls[0]?.[1]
            if (!init) {
                throw new Error('fetch was not called')
            }
            return init
        }

        it('submits data and security as JSON with credentials omitted', async () => {
            fetchMock.mockResolvedValueOnce(acceptedResponse())
            const client = createFormClient({ baseUrl, fetch: fetchMock })

            const result = await client.submit('kontakt', {
                data: { email: 'a@example.com' },
                security: { website: '' },
            })

            expect(result).toEqual({ status: 'accepted' })
            expect(fetchMock.mock.calls[0]?.[0]).toBe(submitUrl)
            const init = lastInit()
            expect(init.method).toBe('POST')
            expect(init.credentials).toBe('omit')
            expect(init.body).toBe('{"data":{"email":"a@example.com"},"security":{"website":""}}')
        })

        it('omits security when not given', async () => {
            fetchMock.mockResolvedValueOnce(acceptedResponse())
            const client = createFormClient({ baseUrl, fetch: fetchMock })

            await client.submit('kontakt', { data: { email: 'a@example.com' } })

            expect(lastInit().body).toBe('{"data":{"email":"a@example.com"}}')
        })

        it('adds header and query values', async () => {
            fetchMock.mockResolvedValueOnce(acceptedResponse())
            const client = createFormClient({ baseUrl, fetch: fetchMock })

            await client.submit('kontakt', {
                data: {},
                headers: { 'x-captcha': 't' },
                query: { formToken: 'x' },
            })

            expect(fetchMock.mock.calls[0]?.[0]).toBe(`${submitUrl}?formToken=x`)
            expect(lastInit().headers).toMatchObject({ 'x-captcha': 't' })
        })
    })
})
