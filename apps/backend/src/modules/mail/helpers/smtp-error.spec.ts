import { describe, expect, it } from 'vitest'
import { isTransientSmtpError } from './smtp-error.js'

describe('isTransientSmtpError', () => {
    it.each<[string, unknown, boolean]>([
        ['a 421 response', Object.assign(new Error('421 service not available'), { responseCode: 421 }), true],
        ['a 450 response', Object.assign(new Error('450 mailbox busy'), { responseCode: 450 }), true],
        ['a 550 response', Object.assign(new Error('550 rejected'), { responseCode: 550 }), false],
        ['a connection error', Object.assign(new Error('connection closed'), { code: 'ECONNECTION' }), true],
        ['a timeout', Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }), true],
        ['a socket error', Object.assign(new Error('socket'), { code: 'ESOCKET' }), true],
        ['a dns error', Object.assign(new Error('dns'), { code: 'EDNS' }), true],
        ['a connection reset', Object.assign(new Error('reset'), { code: 'ECONNRESET' }), true],
        ['a refused connection', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }), true],
        ['a TLS failure', Object.assign(new Error('tls'), { code: 'ETLS' }), true],
        ['an authentication error', Object.assign(new Error('auth'), { code: 'EAUTH' }), false],
        ['an envelope error', Object.assign(new Error('envelope'), { code: 'EENVELOPE' }), false],
        ['a message error', Object.assign(new Error('message'), { code: 'EMESSAGE' }), false],
        [
            'a 5xx response over a transient code',
            Object.assign(new Error('rejected'), { code: 'ECONNECTION', responseCode: 554 }),
            false,
        ],
        ['a plain error', new Error('x'), false],
        ['a string', 'string', false],
        ['null', null, false],
    ])('classifies %s', (_label, error, expected) => {
        expect(isTransientSmtpError(error)).toBe(expected)
    })
})
