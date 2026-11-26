import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MailerError } from '../core/mailer-error.ts'
import { MailerSender, type SendRequest } from './mailer-sender.ts'

const baseUrl = 'https://api.example.com'
const sendUrl = 'https://api.example.com/api/v1/send'
const browserMessage =
    'MailerSender would expose your API key in the browser. Keep it on a server, or pass dangerouslyAllowBrowser: true if exposing the key is an accepted risk.'

const request: SendRequest = {
    from: 'a@example.com',
    to: 'b@example.org',
    subject: 'Hello',
    html: '<p>Hi</p>',
}

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('MailerSender', () => {
    let fetchMock: Mock<typeof fetch>

    beforeEach(() => {
        fetchMock = vi.fn<typeof fetch>()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    function createSender(): MailerSender {
        return new MailerSender({ baseUrl, apiKey: 'secret', fetch: fetchMock })
    }

    it('sends the bearer header and JSON body without a key query parameter', async () => {
        fetchMock.mockResolvedValue(jsonResponse(201, { mailMessageId: 42, status: 'sent' }))

        await createSender().send(request)

        const [url, init] = fetchMock.mock.calls[0] ?? []
        expect(url).toBe(sendUrl)
        expect(typeof url === 'string' && url.includes('?')).toBe(false)
        expect(init?.credentials).toBeUndefined()
        expect(init?.method).toBe('POST')
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' })
        expect(JSON.parse(init?.body as string)).toEqual(request)
    })

    it('resolves the send result', async () => {
        fetchMock.mockResolvedValue(jsonResponse(201, { mailMessageId: 42, status: 'sent' }))

        await expect(createSender().send(request)).resolves.toEqual({ mailMessageId: 42, status: 'sent' })
    })

    it('rejects a forbidden domain as not retryable', async () => {
        fetchMock.mockResolvedValue(jsonResponse(403, { code: 'FROM_DOMAIN_NOT_ALLOWED', message: 'no' }))

        const error = await createSender()
            .send(request)
            .catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(MailerError)
        expect(error).toMatchObject({ code: 'FROM_DOMAIN_NOT_ALLOWED', retryable: false })
    })

    it('rejects a failed delivery as retryable with the mail message id', async () => {
        fetchMock.mockResolvedValue(jsonResponse(502, { code: 'DELIVERY_FAILED', mailMessageId: 9 }))

        const error = await createSender()
            .send(request)
            .catch((caught: unknown) => caught)

        expect(error).toMatchObject({ code: 'DELIVERY_FAILED', retryable: true, mailMessageId: 9 })
    })

    it('refuses to construct in a browser', () => {
        vi.stubGlobal('document', {})

        expect(() => createSender()).toThrow(new Error(browserMessage))
    })

    it('constructs in a browser with dangerouslyAllowBrowser', () => {
        vi.stubGlobal('document', {})

        expect(
            () => new MailerSender({ baseUrl, apiKey: 'secret', fetch: fetchMock, dangerouslyAllowBrowser: true }),
        ).not.toThrow()
    })

    it('requires an apiKey', () => {
        expect(() => new MailerSender({ baseUrl, apiKey: '', fetch: fetchMock })).toThrow(
            new TypeError('apiKey is required'),
        )
    })
})
