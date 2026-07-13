import { describe, expect, it } from 'vitest'
import { DsnParserService } from './dsn-parser.service'
import { BounceType } from '../interfaces/bounce.interface'

function dsnMessage(deliveryStatusBody: string, messageId = '<dsn-1@relay.example.com>'): string {
    return [
        'From: MAILER-DAEMON@relay.example.com',
        'To: bounces@schwarzdavid.email',
        'Subject: Undelivered Mail Returned to Sender',
        'Date: Mon, 13 Jul 2026 10:00:00 +0000',
        `Message-ID: ${messageId}`,
        'MIME-Version: 1.0',
        'Content-Type: multipart/report; report-type=delivery-status; boundary="BOUND"',
        '',
        '--BOUND',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'This is the mail system at host relay.example.com.',
        '',
        '--BOUND',
        'Content-Type: message/delivery-status',
        '',
        deliveryStatusBody,
        '',
        '--BOUND--',
        '',
    ].join('\r\n')
}

const service = new DsnParserService()

describe('DsnParserService', () => {
    it('parses a permanent failure DSN', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; Missing@Example.org',
                'Action: failed',
                'Status: 5.1.1',
                'Diagnostic-Code: smtp; 550 5.1.1 <missing@example.org>: User unknown',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result).toEqual({
            messageId: '<dsn-1@relay.example.com>',
            receivedAt: new Date('2026-07-13T10:00:00.000Z'),
            recipients: [
                {
                    emailAddress: 'missing@example.org',
                    type: BounceType.PERMANENT,
                    statusCode: '5.1.1',
                    reason: '550 5.1.1 <missing@example.org>: User unknown',
                },
            ],
        })
    })

    it('extracts the status code from an annotated status field', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; annotated@example.org',
                'Action: failed',
                'Status: 5.1.1 (permanent failure)',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toEqual([
            expect.objectContaining({
                emailAddress: 'annotated@example.org',
                type: BounceType.PERMANENT,
                statusCode: '5.1.1',
            }),
        ])
    })

    it('yields a null status code when the status field cannot be parsed', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; garbled@example.org',
                'Action: failed',
                'Status: nonsense',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toEqual([
            expect.objectContaining({
                emailAddress: 'garbled@example.org',
                type: BounceType.PERMANENT,
                statusCode: null,
            }),
        ])
    })

    it('skips a recipient whose address exceeds 255 characters', async () => {
        const overlongAddress = `${'a'.repeat(250)}@example.org`
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                `Final-Recipient: rfc822; ${overlongAddress}`,
                'Action: failed',
                'Status: 5.1.1',
            ].join('\r\n'),
        )

        await expect(service.parse(source)).resolves.toBeNull()
    })

    it('classifies a 4.x.x failure as transient', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; full@example.org',
                'Action: failed',
                'Status: 4.2.2',
                'Diagnostic-Code: smtp; 452 4.2.2 Mailbox full',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toEqual([
            expect.objectContaining({ emailAddress: 'full@example.org', type: BounceType.TRANSIENT }),
        ])
    })

    it('classifies a delayed notification as transient', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; slow@example.org',
                'Action: delayed',
                'Status: 4.4.1',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toEqual([
            expect.objectContaining({
                emailAddress: 'slow@example.org',
                type: BounceType.TRANSIENT,
                reason: 'delayed (4.4.1)',
            }),
        ])
    })

    it('strips angle brackets from the final recipient address', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; <Bracketed@Example.org>',
                'Action: failed',
                'Status: 5.1.1',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toEqual([expect.objectContaining({ emailAddress: 'bracketed@example.org' })])
    })

    it('reports every failed recipient of a multi-recipient DSN', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; first@example.org',
                'Action: failed',
                'Status: 5.1.1',
                '',
                'Final-Recipient: rfc822; second@example.org',
                'Action: failed',
                'Status: 5.2.1',
            ].join('\r\n'),
        )

        const result = await service.parse(source)

        expect(result?.recipients).toHaveLength(2)
        expect(result?.recipients[0]?.emailAddress).toBe('first@example.org')
        expect(result?.recipients[1]?.emailAddress).toBe('second@example.org')
    })

    it('ignores recipients that were delivered or relayed', async () => {
        const source = dsnMessage(
            [
                'Reporting-MTA: dns; relay.example.com',
                '',
                'Final-Recipient: rfc822; ok@example.org',
                'Action: relayed',
                'Status: 2.0.0',
            ].join('\r\n'),
        )

        await expect(service.parse(source)).resolves.toBeNull()
    })

    it('returns null for a regular non-DSN mail', async () => {
        const source = [
            'From: someone@example.org',
            'To: bounces@schwarzdavid.email',
            'Subject: Hello',
            'Date: Mon, 13 Jul 2026 10:00:00 +0000',
            'Message-ID: <plain-1@example.org>',
            'Content-Type: text/plain; charset=utf-8',
            '',
            'Just a regular mail.',
            '',
        ].join('\r\n')

        await expect(service.parse(source)).resolves.toBeNull()
    })
})
