export class MailSendError extends Error {
    constructor(
        readonly mailMessageId: number,
        override readonly cause: unknown,
    ) {
        super(cause instanceof Error ? cause.message : String(cause), { cause })
        this.name = 'MailSendError'
    }
}
