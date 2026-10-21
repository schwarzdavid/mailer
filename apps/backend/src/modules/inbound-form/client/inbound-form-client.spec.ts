import { runInThisContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { installInboundFormClient } from './inbound-form-client.js'

interface InboundFormGlobal {
    getToken(slug: string): Promise<string>
}

interface ClientTarget {
    InboundForm?: unknown
    fetch: typeof fetch
    setTimeout: typeof setTimeout
}

type Installer = (target: ClientTarget, scriptSrc: string | null | undefined) => void

const scriptSrc = 'https://api.example.com/api/public/form/client.js'
const tokenUrl = 'https://api.example.com/api/public/form/kontakt/token'

function tokenResponse(token: string, waitMs: number): Response {
    return new Response(JSON.stringify({ token, notBefore: '', expiresAt: '', waitMs }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })
}

function isInboundFormGlobal(value: unknown): value is InboundFormGlobal {
    return typeof value === 'object' && value !== null && 'getToken' in value && typeof value.getToken === 'function'
}

function tracked(promise: Promise<string>): { settled: () => boolean; promise: Promise<string> } {
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

function serializedInstaller(): Installer {
    const compiled: unknown = runInThisContext(`(${installInboundFormClient.toString()})`)
    if (typeof compiled !== 'function') {
        throw new Error('expected a function')
    }
    return (target, src) => {
        Reflect.apply(compiled, undefined, [target, src])
    }
}

describe.each<[string, () => Installer]>([
    ['runs as a module function', () => installInboundFormClient],
    ['survives toString serialization', serializedInstaller],
])('%s', (_, installer) => {
    let fetchMock: Mock<typeof fetch>
    let target: ClientTarget

    function install(): InboundFormGlobal {
        installer()(target, scriptSrc)
        if (!isInboundFormGlobal(target.InboundForm)) {
            throw new Error('InboundForm was not installed')
        }
        return target.InboundForm
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        fetchMock = vi.fn<typeof fetch>()
        target = {
            fetch: fetchMock,
            setTimeout,
        }
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('fetches lazily and waits the remaining delay', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 3000))
        const client = install()

        expect(fetchMock).not.toHaveBeenCalled()

        const result = tracked(client.getToken('kontakt'))

        expect(fetchMock).toHaveBeenCalledWith(tokenUrl, expect.objectContaining({ method: 'POST' }))
        await vi.advanceTimersByTimeAsync(2999)
        expect(result.settled()).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await expect(result.promise).resolves.toBe('t1')
    })

    it('hands each token out once', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0)).mockResolvedValueOnce(tokenResponse('t2', 0))
        const client = install()

        const first = client.getToken('kontakt')
        await vi.runAllTimersAsync()
        await expect(first).resolves.toBe('t1')

        const second = client.getToken('kontakt')
        await vi.runAllTimersAsync()
        await expect(second).resolves.toBe('t2')

        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('reuses an in-flight token request', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 3000))
        const client = install()

        const prefetch = client.getToken('kontakt')
        await vi.advanceTimersByTimeAsync(1000)
        const atSubmit = client.getToken('kontakt')
        await vi.advanceTimersByTimeAsync(2000)

        await expect(prefetch).resolves.toBe('t1')
        await expect(atSubmit).resolves.toBe('t1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('rejects with the status', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('{}', { status: 429 }))
            .mockResolvedValueOnce(tokenResponse('t1', 0))
        const client = install()

        const failure: unknown = await client.getToken('kontakt').catch((error: unknown) => error)

        expect(failure).toBeInstanceOf(Error)
        expect(failure).toHaveProperty('status', 429)

        const retry = client.getToken('kontakt')
        await vi.runAllTimersAsync()
        await expect(retry).resolves.toBe('t1')
    })

    it('derives the api base from a script src with a query string', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0))
        installer()(target, `${scriptSrc}?v=2`)
        if (!isInboundFormGlobal(target.InboundForm)) {
            throw new Error('InboundForm was not installed')
        }

        const token = target.InboundForm.getToken('kontakt')
        await vi.runAllTimersAsync()

        await expect(token).resolves.toBe('t1')
        expect(fetchMock).toHaveBeenCalledWith(tokenUrl, expect.anything())
    })

    it('encodes the slug in the token url', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0))
        const client = install()

        const token = client.getToken('a/b')
        await vi.runAllTimersAsync()

        await expect(token).resolves.toBe('t1')
        expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/public/form/a%2Fb/token', expect.anything())
    })
})
