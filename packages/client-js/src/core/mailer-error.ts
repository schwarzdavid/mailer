export type SendErrorCode =
    'FROM_DOMAIN_NOT_ALLOWED' | 'FROM_DOMAIN_NOT_READY' | 'RECIPIENT_BLOCKED' | 'DELIVERY_FAILED'

export interface MailerErrorInit {
    status: number
    code?: string
    messages: string[]
    mailMessageId?: number
    cause?: unknown
}

const RETRYABLE_STATUSES = new Set([0, 429, 502, 503])

export function isRetryableStatus(status: number): boolean {
    return RETRYABLE_STATUSES.has(status)
}

function describeCause(cause: unknown): string {
    return cause instanceof Error ? cause.name : typeof cause
}

function buildMessage(init: MailerErrorInit): string {
    if (init.status === 0) {
        return `Mailer request failed: ${describeCause(init.cause)}`
    }
    const base = `Mailer request failed with status ${init.status}`
    return init.messages.length > 0 ? `${base}: ${init.messages.join('; ')}` : base
}

export class MailerError extends Error {
    override readonly name = 'MailerError'
    readonly status: number
    readonly code?: SendErrorCode | (string & {})
    readonly messages: string[]
    readonly mailMessageId?: number
    readonly retryable: boolean

    constructor(init: MailerErrorInit) {
        super(buildMessage(init), init.cause === undefined ? undefined : { cause: init.cause })
        this.status = init.status
        this.code = init.code
        this.messages = init.messages
        this.mailMessageId = init.mailMessageId
        this.retryable = isRetryableStatus(init.status)
    }
}
