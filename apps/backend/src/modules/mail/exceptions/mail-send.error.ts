import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception.js'
import { isTransientSmtpError } from '../helpers/smtp-error.js'

export class MailSendError extends Error {
    readonly transient: boolean

    constructor(
        readonly mailMessageId: number,
        override readonly cause: unknown,
    ) {
        super(cause instanceof Error ? cause.message : String(cause), { cause })
        this.name = 'MailSendError'
        this.transient = !(cause instanceof EmailBlockedException) && isTransientSmtpError(cause)
    }
}
