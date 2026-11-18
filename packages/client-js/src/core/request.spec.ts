import { describe, expect, it, vi, type Mock } from 'vitest'
import { MailerError } from './mailer-error.ts'
import { requestJson, resolveRequestOptions, type ResolvedRequestOptions } from './request.ts'

function setup() {
    const fetchMock = vi.fn<typeof fetch>()
    const options: ResolvedRequestOptions = {
        apiBase: 'https://app.example.com/api/v1',
        fetch: fetchMock,
        timeoutMs: 1000,
    }
    return { fetchMock, options }
}

function respond(fetchMock: Mock<typeof fetch>, status: number, body: string) {
    fetchMock.mockResolvedValue(new Response(body, { status }))
}

async function failureOf(promise: Promise<unknown>): Promise<MailerError> {
    const error = await promise.then(
        () => undefined,
        (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(MailerError)
    return error as MailerError
}

describe('requestJson', () => {
    it('sends a JSON body and resolves the parsed response', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 200, '{"ok":true}')

        const result = await requestJson<{ ok: boolean }>(options, '/forms/k', { method: 'POST', body: { a: 1 } })

        expect(result).toEqual({ ok: true })
        const [url, init] = fetchMock.mock.calls[0]!
        expect(url).toBe('https://app.example.com/api/v1/forms/k')
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe('{"a":1}')
        expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    })

    it('omits body and content type without a body', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 200, '{}')

        await requestJson(options, '/x', { method: 'POST' })

        const [, init] = fetchMock.mock.calls[0]!
        expect(init?.body).toBeUndefined()
        expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
    })

    it('calls the given fetch without binding it to the options object', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 200, '{}')

        await requestJson(options, '/x', { method: 'POST' })

        expect(fetchMock.mock.contexts[0]).toBeUndefined()
    })

    it('appends the query string', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 200, '{}')

        await requestJson(options, '/x', { method: 'POST', query: { a: '1', b: 'x y' } })

        expect(fetchMock.mock.calls[0]![0]).toBe('https://app.example.com/api/v1/x?a=1&b=x%20y')
    })

    it('merges headers and passes credentials', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 200, '{}')

        await requestJson(options, '/x', {
            method: 'POST',
            body: {},
            headers: { Authorization: 'Bearer k' },
            credentials: 'omit',
        })

        const [, init] = fetchMock.mock.calls[0]!
        const headers = new Headers(init?.headers)
        expect(headers.get('Authorization')).toBe('Bearer k')
        expect(headers.get('Content-Type')).toBe('application/json')
        expect(init?.credentials).toBe('omit')
    })

    it('maps a coded error response', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 403, JSON.stringify({ code: 'FROM_DOMAIN_NOT_ALLOWED', message: 'Not allowed' }))

        const error = await failureOf(requestJson(options, '/x', { method: 'POST' }))

        expect(error.status).toBe(403)
        expect(error.code).toBe('FROM_DOMAIN_NOT_ALLOWED')
        expect(error.messages).toEqual(['Not allowed'])
        expect(error.retryable).toBe(false)
    })

    it('maps an array message', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 400, JSON.stringify({ message: ['a', 'b'] }))

        const error = await failureOf(requestJson(options, '/x', { method: 'POST' }))

        expect(error.messages).toEqual(['a', 'b'])
    })

    it('maps the mail message id', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 422, JSON.stringify({ code: 'RECIPIENT_BLOCKED', mailMessageId: 7 }))

        const error = await failureOf(requestJson(options, '/x', { method: 'POST' }))

        expect(error.mailMessageId).toBe(7)
        expect(error.messages).toEqual([])
    })

    it.each([
        [413, '<html>Too large</html>'],
        [502, 'Bad Gateway'],
    ])('keeps status %i when the body is not JSON', async (status, body) => {
        const { fetchMock, options } = setup()
        respond(fetchMock, status, body)

        const error = await failureOf(requestJson(options, '/x', { method: 'POST' }))

        expect(error.status).toBe(status)
        expect(error.messages).toEqual([])
    })

    it('keeps the response status for an unreadable 2xx body and does not retry', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 202, '<html>not json</html>')

        const error = await failureOf(requestJson(options, '/x', { method: 'POST' }))

        expect(error.status).toBe(202)
        expect(error.messages).toEqual([])
        expect(error.retryable).toBe(false)
        expect(error.cause).toBeInstanceOf(SyntaxError)
    })

    it('does not duplicate a caller content-type of another case', async () => {
        const { fetchMock, options } = setup()
        respond(fetchMock, 200, '{}')

        await requestJson(options, '/x', { method: 'POST', body: {}, headers: { 'content-type': 'text/plain' } })

        const [, init] = fetchMock.mock.calls[0]!
        const names = Object.keys(init?.headers as Record<string, string>).filter(
            (name) => name.toLowerCase() === 'content-type',
        )
        expect(names).toHaveLength(1)
        expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    })

    it('times out without AbortSignal.timeout', async () => {
        const { fetchMock, options } = setup()
        vi.stubGlobal('AbortSignal', { ...AbortSignal, timeout: undefined })
        try {
            fetchMock.mockImplementation(
                (_input, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                            reject(new DOMException('aborted', 'AbortError'))
                        })
                    }),
            )

            const error = await failureOf(requestJson({ ...options, timeoutMs: 20 }, '/x', { method: 'POST' }))

            expect(error.status).toBe(0)
            expect(error.retryable).toBe(true)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('clears the fallback timer once the request settles', async () => {
        const { fetchMock, options } = setup()
        vi.stubGlobal('AbortSignal', { ...AbortSignal, timeout: undefined })
        const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
        try {
            respond(fetchMock, 200, '{}')

            await requestJson(options, '/x', { method: 'POST' })

            expect(clearSpy).toHaveBeenCalled()
        } finally {
            clearSpy.mockRestore()
            vi.unstubAllGlobals()
        }
    })

    it('maps a rejected fetch to status 0', async () => {
        const { fetchMock, options } = setup()
        const cause = new TypeError('Failed to fetch')
        fetchMock.mockRejectedValue(cause)

        const error = await failureOf(requestJson(options, '/x', { method: 'POST' }))

        expect(error.status).toBe(0)
        expect(error.retryable).toBe(true)
        expect(error.cause).toBe(cause)
    })

    it('rejects with status 0 when the request times out', async () => {
        const { fetchMock, options } = setup()
        fetchMock.mockImplementation(
            (_input, init) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new DOMException('The operation timed out', 'TimeoutError'))
                    })
                }),
        )

        const error = await failureOf(requestJson({ ...options, timeoutMs: 20 }, '/x', { method: 'POST' }))

        expect(error.status).toBe(0)
        expect(error.retryable).toBe(true)
    })
})

describe('resolveRequestOptions', () => {
    it.each([0, -1, Infinity, NaN])('rejects timeoutMs %j', (timeoutMs) => {
        expect(() => resolveRequestOptions({ baseUrl: 'https://a.example', timeoutMs })).toThrow(TypeError)
        expect(() => resolveRequestOptions({ baseUrl: 'https://a.example', timeoutMs })).toThrow(
            'timeoutMs must be a positive finite number',
        )
    })

    it('applies defaults and resolves the api base', () => {
        const resolved = resolveRequestOptions({ baseUrl: 'https://app.example.com/' })

        expect(resolved.apiBase).toBe('https://app.example.com/api/v1')
        expect(resolved.timeoutMs).toBe(30_000)
    })

    it('binds the global fetch at call time', async () => {
        const stub = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
        vi.stubGlobal('fetch', stub)
        try {
            const resolved = resolveRequestOptions({ baseUrl: 'https://app.example.com' })
            await resolved.fetch('https://app.example.com/x')
            expect(stub).toHaveBeenCalledTimes(1)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('uses the given fetch and timeout', () => {
        const custom = vi.fn<typeof fetch>()
        const resolved = resolveRequestOptions({ baseUrl: 'https://a.example', fetch: custom, timeoutMs: 5 })

        expect(resolved.fetch).toBe(custom)
        expect(resolved.timeoutMs).toBe(5)
    })
})
