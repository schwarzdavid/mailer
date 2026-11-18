import { describe, expect, it } from 'vitest'
import { isRetryableStatus, MailerError } from './mailer-error.ts'

describe('isRetryableStatus', () => {
    it.each([0, 429, 502, 503])('is true for %i', (status) => {
        expect(isRetryableStatus(status)).toBe(true)
    })

    it.each([400, 401, 403, 404, 413, 422, 500])('is false for %i', (status) => {
        expect(isRetryableStatus(status)).toBe(false)
    })
})

describe('MailerError', () => {
    it('builds the message from status and messages', () => {
        const error = new MailerError({ status: 400, messages: ['email: Invalid email address'] })
        expect(error.message).toBe('Mailer request failed with status 400: email: Invalid email address')
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('MailerError')
        expect(error.retryable).toBe(false)
    })

    it('joins several messages', () => {
        const error = new MailerError({ status: 400, messages: ['a', 'b'] })
        expect(error.message).toBe('Mailer request failed with status 400: a; b')
    })

    it('omits the suffix without messages', () => {
        const error = new MailerError({ status: 502, messages: [] })
        expect(error.message).toBe('Mailer request failed with status 502')
        expect(error.retryable).toBe(true)
    })

    it('names the cause for status 0', () => {
        const cause = new TypeError('boom')
        const error = new MailerError({ status: 0, messages: [], cause })
        expect(error.message).toBe('Mailer request failed: TypeError')
        expect(error.cause).toBe(cause)
        expect(error.retryable).toBe(true)
    })

    it('keeps code and mailMessageId', () => {
        const error = new MailerError({ status: 422, code: 'RECIPIENT_BLOCKED', messages: [], mailMessageId: 7 })
        expect(error.code).toBe('RECIPIENT_BLOCKED')
        expect(error.mailMessageId).toBe(7)
    })
})
