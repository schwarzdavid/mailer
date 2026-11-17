import type { ClientOptions } from '../core/options.ts'
import { requestJson, resolveRequestOptions, type ResolvedRequestOptions } from '../core/request.ts'

export interface SendRequest {
    from: string
    to: string
    replyTo?: string
    subject: string
    html: string
    text?: string
}

export interface SendResult {
    mailMessageId: number
    status: 'sent'
}

export interface MailerSenderOptions extends ClientOptions {
    apiKey: string
    dangerouslyAllowBrowser?: boolean
}

export class MailerSender {
    readonly #options: ResolvedRequestOptions
    readonly #apiKey: string

    constructor(options: MailerSenderOptions) {
        if (typeof globalThis.document !== 'undefined' && !options.dangerouslyAllowBrowser) {
            throw new Error(
                'MailerSender would expose your API key in the browser. Keep it on a server, or pass dangerouslyAllowBrowser: true if exposing the key is an accepted risk.',
            )
        }
        if (!options.apiKey) {
            throw new TypeError('apiKey is required')
        }
        this.#options = resolveRequestOptions(options)
        this.#apiKey = options.apiKey
    }

    send(request: SendRequest): Promise<SendResult> {
        return requestJson<SendResult>(this.#options, '/send', {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.#apiKey}` },
            body: request,
        })
    }
}
