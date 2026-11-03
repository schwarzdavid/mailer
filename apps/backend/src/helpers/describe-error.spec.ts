import { describe, expect, it } from 'vitest'
import { describeError } from './describe-error.js'
import { MailSendError } from '../modules/mail/exceptions/mail-send.error.js'
import { EmailBlockedException } from '../modules/bounce/exceptions/email-blocked.exception.js'

describe('describeError', () => {
    it.each<[string, unknown, string]>([
        ['a plain error by its name', new Error('Recipient field "email" is empty'), 'Error'],
        [
            'an SMTP rejection by its codes',
            Object.assign(new Error('550 5.1.1 <max@example.com>: unknown user'), {
                code: 'EENVELOPE',
                responseCode: 550,
            }),
            'Error (code EENVELOPE, responseCode 550)',
        ],
        [
            'a wrapped cause',
            new MailSendError(9, Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
            'MailSendError caused by Error (code ECONNREFUSED)',
        ],
        [
            'a blocked recipient',
            new MailSendError(9, new EmailBlockedException('max@example.com', new Date('2026-10-23T00:00:00.000Z'))),
            'MailSendError caused by EmailBlockedException',
        ],
        ['a thrown string by its type', 'max@example.com', 'string'],
    ])('describes %s without the message', (_label, error, expected) => {
        expect(describeError(error)).toBe(expected)
    })
})
