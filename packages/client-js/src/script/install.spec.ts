import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MailerError } from '../core/mailer-error.ts'
import { installInboundForm, type InboundFormGlobal } from './install.ts'

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

function installed(scriptSrc: string | null | undefined): InboundFormGlobal {
    const target: { InboundForm?: unknown } = {}
    installInboundForm(target, scriptSrc)
    return target.InboundForm as InboundFormGlobal
}

describe('installInboundForm', () => {
    let fetchMock: Mock<typeof fetch>

    beforeEach(() => {
        fetchMock = vi.fn<typeof fetch>()
        vi.stubGlobal('fetch', fetchMock)
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('derives the api base from a script src with a query string', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0))
        const form = installed('https://api.example.com/api/v1/forms/client.js?v=2')

        const token = form.getToken('kontakt')
        await vi.advanceTimersByTimeAsync(0)

        await expect(token).resolves.toBe('t1')
        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/api/v1/forms/kontakt/token')
    })

    it('keeps a sub-path in front of the api prefix', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0))
        const form = installed('https://h.example/mailer/api/v1/forms/client.js#x')

        const token = form.getToken('kontakt')
        await vi.advanceTimersByTimeAsync(0)
        await token

        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://h.example/mailer/api/v1/forms/kontakt/token')
    })

    it('resolves the token only after waitMs', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 1500))
        const form = installed('https://api.example.com/api/v1/forms/client.js')
        let settled = false

        const token = form.getToken('kontakt').then((value) => {
            settled = true
            return value
        })
        await vi.advanceTimersByTimeAsync(1499)
        expect(settled).toBe(false)
        await vi.advanceTimersByTimeAsync(1)

        await expect(token).resolves.toBe('t1')
    })

    it('rejects with the response status on a failed token request', async () => {
        fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }))
        const form = installed('https://api.example.com/api/v1/forms/client.js')

        const error: unknown = await form.getToken('kontakt').catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(MailerError)
        expect((error as MailerError).status).toBe(404)
    })

    it('exposes only getToken, submit and MailerForm', () => {
        const form = installed('https://api.example.com/api/v1/forms/client.js')

        expect(Object.keys(form).sort()).toEqual(['MailerForm', 'getToken', 'submit'])
    })

    it('posts a MailerForm submission to the derived base with the token', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('t1', 0)).mockResolvedValueOnce(acceptedResponse())
        const form = installed('https://api.example.com/api/v1/forms/client.js')
        const mailerForm = new form.MailerForm({
            formKey: 'kontakt',
            timedToken: { key: 'formToken', location: 'body' },
        })

        const result = mailerForm.submit({ data: {} })
        await vi.advanceTimersByTimeAsync(0)

        await expect(result).resolves.toEqual({ status: 'accepted' })
        const [url, init] = fetchMock.mock.calls[1] ?? []
        expect(url).toBe('https://api.example.com/api/v1/forms/kontakt')
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({
            data: {},
            security: { formToken: 't1' },
        })
    })

    it('lets a MailerForm override the derived base url', async () => {
        fetchMock.mockResolvedValueOnce(acceptedResponse())
        const form = installed('https://api.example.com/api/v1/forms/client.js')

        await new form.MailerForm({ formKey: 'kontakt', baseUrl: 'https://other.example' }).submit({ data: {} })

        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://other.example/api/v1/forms/kontakt')
    })

    it('installs without throwing when the script src is missing and rejects calls', async () => {
        const target: { InboundForm?: unknown } = {}

        expect(() => installInboundForm(target, null)).not.toThrow()
        const form = target.InboundForm as InboundFormGlobal

        await expect(form.getToken('kontakt')).rejects.toBeInstanceOf(TypeError)
        expect(() => new form.MailerForm({ formKey: 'kontakt' })).toThrow(TypeError)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
