import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from 'vitest'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import type SMTPConnection from 'nodemailer/lib/smtp-connection/index.js'
import { MailService, SendMail, SendMailContext } from './mail.service.js'
import { MailMessageService } from './mail-message.service.js'
import { MailSendError } from '../exceptions/mail-send.error.js'
import { MailMessage, MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'
import { MAIL_TRANSPORTER } from '../mail.constants.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { SecretEncryptionService } from '../../encryption/services/secret-encryption.service.js'
import { Domain, DomainWithActiveDkim } from '../../domain/interfaces/domain.interface.js'
import { DomainDkimAlgorithm } from '../../domain/interfaces/domain-dkim.interface.js'
import { EmailBlockService } from '../../bounce/services/email-block.service.js'
import { BounceService } from '../../bounce/services/bounce.service.js'
import { BounceType } from '../../bounce/interfaces/bounce.interface.js'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception.js'

function smtpError(
    message: string,
    fields: Pick<SMTPConnection.SMTPError, 'code' | 'response' | 'responseCode' | 'command'>,
): SMTPConnection.SMTPError {
    return Object.assign(new Error(message), fields)
}

describe('MailService', () => {
    let service: MailService
    let sendMail: Mock<Transporter<SMTPTransport.SentMessageInfo>['sendMail']>
    let getSendingDomainByFqdn: Mock<DomainService['getSendingDomainByFqdn']>
    let getConfiguredSendingDomain: Mock<DomainService['getConfiguredSendingDomain']>
    let decrypt: Mock<SecretEncryptionService['decrypt']>
    let assertNotBlocked: Mock<EmailBlockService['assertNotBlocked']>
    let recordBounce: Mock<BounceService['recordBounce']>
    let recordPending: Mock<MailMessageService['recordPending']>
    let markSent: Mock<MailMessageService['markSent']>
    let markUnsent: Mock<MailMessageService['markUnsent']>
    let logSpy: MockInstance<Logger['log']>
    let errorSpy: MockInstance<Logger['error']>

    const sendingDomain: DomainWithActiveDkim = {
        domainId: 1,
        fqdn: 'mail.example.com',
        rootDomain: 'example.com',
        activeDkimId: 7,
        dnsRecords: [],
        lastCheckedAt: null,
        activeDkim: {
            dkimId: 7,
            domainId: 1,
            selector: 's1',
            publicKey: 'pub',
            privateKey: 'v1.encrypted-key',
            algorithm: DomainDkimAlgorithm.RSA,
            keyBits: 2048,
            createdAt: new Date(),
        },
    }

    const mail: SendMail = {
        from: 'noreply@mail.example.com',
        to: 'owner@business.com',
        subject: 'New submission',
        html: '<p>Hello</p>',
    }

    const context: SendMailContext = { projectId: 3, source: MailMessageSource.INBOUND_FORM }
    const pendingMessage: MailMessage = {
        mailMessageId: 41,
        projectId: 3,
        source: MailMessageSource.INBOUND_FORM,
        apiKeyId: null,
        emailFrom: 'noreply@mail.example.com',
        emailTo: 'owner@business.com',
        subject: 'New submission',
        status: MailMessageStatus.PENDING,
        error: null,
        smtpMessageId: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
    const sentInfo: SMTPTransport.SentMessageInfo = {
        envelope: { from: 'bounce@mail.example.com', to: ['owner@business.com'] },
        messageId: '<m1@mail.example.com>',
        accepted: ['owner@business.com'],
        rejected: [],
        pending: [],
        response: '250 OK',
    }

    beforeEach(async () => {
        logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        sendMail = vi.fn<typeof sendMail>().mockResolvedValue(sentInfo)
        getSendingDomainByFqdn = vi.fn<typeof getSendingDomainByFqdn>().mockResolvedValue(sendingDomain)
        getConfiguredSendingDomain = vi.fn<typeof getConfiguredSendingDomain>().mockResolvedValue(null)
        decrypt = vi.fn<typeof decrypt>().mockResolvedValue('-----BEGIN PRIVATE KEY-----')
        assertNotBlocked = vi.fn<typeof assertNotBlocked>().mockResolvedValue(undefined)
        recordBounce = vi.fn<typeof recordBounce>().mockResolvedValue(undefined)
        recordPending = vi.fn<typeof recordPending>().mockResolvedValue(pendingMessage)
        markSent = vi.fn<typeof markSent>().mockResolvedValue(undefined)
        markUnsent = vi.fn<typeof markUnsent>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MailService,
                { provide: MAIL_TRANSPORTER, useValue: { sendMail } },
                { provide: DomainService, useValue: { getSendingDomainByFqdn, getConfiguredSendingDomain } },
                { provide: SecretEncryptionService, useValue: { decrypt } },
                { provide: EmailBlockService, useValue: { assertNotBlocked } },
                { provide: BounceService, useValue: { recordBounce } },
                { provide: MailMessageService, useValue: { recordPending, markSent, markUnsent } },
            ],
        }).compile()

        service = module.get(MailService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('signs with the sending domain dkim key and hands the mail to the transporter', async () => {
        await service.sendMail(mail, context)

        expect(getSendingDomainByFqdn).toHaveBeenCalledWith('mail.example.com')
        expect(decrypt).toHaveBeenCalledWith('v1.encrypted-key')
        expect(sendMail).toHaveBeenCalledWith({
            from: 'noreply@mail.example.com',
            to: 'owner@business.com',
            replyTo: undefined,
            subject: 'New submission',
            html: '<p>Hello</p>',
            text: undefined,
            envelope: undefined,
            dkim: {
                domainName: 'mail.example.com',
                keySelector: 's1',
                privateKey: '-----BEGIN PRIVATE KEY-----',
            },
        })
    })

    it('passes replyTo through when set', async () => {
        await service.sendMail({ ...mail, replyTo: 'visitor@example.org' }, context)

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'visitor@example.org' }))
    })

    it('rejects when no sending domain is configured for the from address', async () => {
        getSendingDomainByFqdn.mockResolvedValue(null)

        await expect(service.sendMail(mail, context)).rejects.toThrow(
            'No sending domain configured for mail.example.com',
        )
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('rejects a from address without a domain part', async () => {
        await expect(service.sendMail({ ...mail, from: 'broken-address' }, context)).rejects.toThrow(
            'Invalid from address',
        )
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('refuses to send to a blocked recipient before touching the transporter', async () => {
        const blocked = new EmailBlockedException('owner@business.com', new Date())
        assertNotBlocked.mockRejectedValue(blocked)

        const error = await service.sendMail(mail, context).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(MailSendError)
        expect((error as MailSendError).cause).toBeInstanceOf(EmailBlockedException)
        expect(assertNotBlocked).toHaveBeenCalledWith('owner@business.com')
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('uses a bounce address at the configured sending domain as the envelope sender', async () => {
        const configuredSendingDomain: Domain = {
            domainId: 10,
            fqdn: 'mail.sending-domain.org',
            rootDomain: 'sending-domain.org',
            activeDkimId: 77,
            dnsRecords: [],
            lastCheckedAt: null,
        }
        getConfiguredSendingDomain.mockResolvedValue(configuredSendingDomain)

        await service.sendMail(mail, context)

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                envelope: { from: 'bounce@mail.sending-domain.org', to: 'owner@business.com' },
            }),
        )
    })

    it('sends without an envelope override when no sending domain is configured', async () => {
        await service.sendMail(mail, context)

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ envelope: undefined }))
    })

    it('records a bounce for 550 5.1.1 at RCPT TO and rethrows', async () => {
        const response =
            '550 5.1.1 <owner@business.com>: Recipient address rejected: User unknown in virtual mailbox table'
        const rejection = smtpError(response, {
            code: 'EENVELOPE',
            response,
            responseCode: 550,
            command: 'RCPT TO',
        })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).toHaveBeenCalledExactlyOnceWith({
            emailAddress: 'owner@business.com',
            type: BounceType.PERMANENT,
            statusCode: '550',
            reason: response,
            messageId: null,
            receivedAt: expect.any(Date) as Date,
        })
    })

    it.each(['5.1.1', '5.1.2', '5.1.3', '5.1.6', '5.1.10'])(
        'records a bounce for the destination-address code %s at RCPT TO',
        async (enhancedCode) => {
            const response = `550 ${enhancedCode} <owner@business.com>: Recipient address rejected`
            sendMail.mockRejectedValue(
                smtpError(response, { code: 'EENVELOPE', response, responseCode: 550, command: 'RCPT TO' }),
            )

            await expect(service.sendMail(mail, context)).rejects.toBeInstanceOf(MailSendError)
            expect(recordBounce).toHaveBeenCalledOnce()
        },
    )

    it('records a bounce when the enhanced code follows a continuation hyphen', async () => {
        const response = '550-5.1.1 The email account that you tried to reach does not exist'
        sendMail.mockRejectedValue(
            smtpError(response, { code: 'EENVELOPE', response, responseCode: 550, command: 'RCPT TO' }),
        )

        await expect(service.sendMail(mail, context)).rejects.toBeInstanceOf(MailSendError)
        expect(recordBounce).toHaveBeenCalledOnce()
    })

    it('does not record the spoof-protection rejection at RCPT TO and rethrows', async () => {
        const response =
            '553 5.7.1 <other@mail.smoke.test>: Sender address rejected: not owned by user bounce@mail.smoke.test'
        const rejection = smtpError(response, { code: 'EENVELOPE', response, responseCode: 553, command: 'RCPT TO' })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).not.toHaveBeenCalled()
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.FAILED, rejection.message)
    })

    it('does not record a sender-address code at RCPT TO', async () => {
        const response = '553 5.1.8 <bounce@nowhere.invalid>: Sender address rejected: Domain not found'
        const rejection = smtpError(response, { code: 'EENVELOPE', response, responseCode: 553, command: 'RCPT TO' })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('does not record a RCPT TO 5xx without an enhanced status code', async () => {
        const response = '550 Mailbox unavailable'
        const rejection = smtpError(response, { code: 'EENVELOPE', response, responseCode: 550, command: 'RCPT TO' })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('does not record a RCPT TO 5xx when the error carries no response text', async () => {
        const rejection = smtpError('rejected', { code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('does not record a bounce when the server rejects the envelope sender at MAIL FROM and rethrows', async () => {
        const rejection = smtpError('Mail command failed: 553 5.7.1 Sender address rejected: not owned by user', {
            code: 'EENVELOPE',
            responseCode: 553,
            command: 'MAIL FROM',
        })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).not.toHaveBeenCalled()
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.FAILED, rejection.message)
    })

    it('does not record a bounce when authentication fails and rethrows', async () => {
        const rejection = smtpError('Invalid login: 535 5.7.8 Error: authentication failed', {
            code: 'EAUTH',
            responseCode: 535,
            command: 'AUTH PLAIN',
        })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).not.toHaveBeenCalled()
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.FAILED, rejection.message)
    })

    it('does not record a bounce when the server defers the recipient at RCPT TO with a 4xx', async () => {
        const rejection = smtpError('451 4.3.0 try again later', {
            code: 'EENVELOPE',
            responseCode: 451,
            command: 'RCPT TO',
        })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('still rejects with the transporter error when bounce recording itself fails', async () => {
        const response = '550 5.1.1 rejected'
        const rejection = smtpError(response, { code: 'EENVELOPE', response, responseCode: 550, command: 'RCPT TO' })
        sendMail.mockRejectedValue(rejection)
        recordBounce.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail, context)).rejects.toHaveProperty('cause', rejection)
        expect(recordBounce).toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
            'Failed to record rejection bounce for mail message 41: db down',
        )
    })

    it('logs a sent mail by its message id, never by address', async () => {
        await service.sendMail(mail, context)

        expect(logSpy).toHaveBeenLastCalledWith('Sent mail message 41')
    })

    it('never sends unsigned mail when the DKIM key cannot be decrypted', async () => {
        decrypt.mockRejectedValue(new Error('Unsupported state or unable to authenticate data'))

        await expect(service.sendMail(mail, context)).rejects.toThrow(
            'Unsupported state or unable to authenticate data',
        )
        expect(sendMail).not.toHaveBeenCalled()
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('does not record a bounce for connection errors without an SMTP response code', async () => {
        sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'))

        await expect(service.sendMail(mail, context)).rejects.toThrow('connect ECONNREFUSED')
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('resolves the sending domain from the part after the @ of the from address', async () => {
        await service.sendMail({ ...mail, from: 'Support.Team@mail.example.com' }, context)

        expect(getSendingDomainByFqdn).toHaveBeenCalledWith('mail.example.com')
    })

    it('logs a pending message before sending and marks it sent with the smtp message id', async () => {
        const result = await service.sendMail(mail, { projectId: 3, source: MailMessageSource.API, apiKeyId: 9 })

        expect(recordPending).toHaveBeenCalledWith({
            projectId: 3,
            source: MailMessageSource.API,
            apiKeyId: 9,
            emailFrom: 'noreply@mail.example.com',
            emailTo: 'owner@business.com',
            subject: 'New submission',
        })
        expect(recordPending.mock.invocationCallOrder[0]).toBeLessThan(sendMail.mock.invocationCallOrder[0]!)
        expect(markSent).toHaveBeenCalledWith(41, '<m1@mail.example.com>')
        expect(result).toEqual({ mailMessageId: 41, smtpMessageId: '<m1@mail.example.com>' })
    })

    it('logs inbound form sends without an api key', async () => {
        await service.sendMail(mail, context)

        expect(recordPending).toHaveBeenCalledWith(expect.objectContaining({ apiKeyId: null }))
    })

    it('passes the plain-text part through to the transporter', async () => {
        await service.sendMail({ ...mail, text: 'Hello' }, context)

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello' }))
    })

    it('marks a blocked recipient as blocked and wraps the block in a MailSendError', async () => {
        const blocked = new EmailBlockedException('owner@business.com', new Date())
        assertNotBlocked.mockRejectedValue(blocked)

        const error = await service.sendMail(mail, context).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(MailSendError)
        expect((error as MailSendError).mailMessageId).toBe(41)
        expect((error as MailSendError).cause).toBe(blocked)
        expect((error as MailSendError).transient).toBe(false)
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.BLOCKED, blocked.message)
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('marks a transporter failure as failed', async () => {
        sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'))

        await expect(service.sendMail(mail, context)).rejects.toThrow(MailSendError)
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.FAILED, 'connect ECONNREFUSED')
    })

    it('flags a 4xx transporter failure as transient', async () => {
        sendMail.mockRejectedValue(smtpError('421 4.3.2 shutting down', { code: 'ECONNECTION', responseCode: 421 }))

        const error = await service.sendMail(mail, context).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(MailSendError)
        expect((error as MailSendError).transient).toBe(true)
    })

    it('flags a 5xx transporter failure as permanent', async () => {
        sendMail.mockRejectedValue(smtpError('550 5.7.1 rejected', { code: 'EENVELOPE', responseCode: 550 }))

        const error = await service.sendMail(mail, context).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(MailSendError)
        expect((error as MailSendError).transient).toBe(false)
    })

    it('marks a missing sending domain as failed', async () => {
        getSendingDomainByFqdn.mockResolvedValue(null)

        await expect(service.sendMail(mail, context)).rejects.toThrow('No sending domain configured')
        expect(markUnsent).toHaveBeenCalledWith(
            41,
            MailMessageStatus.FAILED,
            'No sending domain configured for mail.example.com',
        )
    })

    it('still reports success when marking the message sent fails', async () => {
        markSent.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail, context)).resolves.toEqual({
            mailMessageId: 41,
            smtpMessageId: '<m1@mail.example.com>',
        })
    })

    it('still rejects with the send error when marking the message failed also fails', async () => {
        sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'))
        markUnsent.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail, context)).rejects.toThrow('connect ECONNREFUSED')
    })

    it('sends nothing when the pending message cannot be recorded', async () => {
        recordPending.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail, context)).rejects.toThrow('db down')
        expect(sendMail).not.toHaveBeenCalled()
    })
})
