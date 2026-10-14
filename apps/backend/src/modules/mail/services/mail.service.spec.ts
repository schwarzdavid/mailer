import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
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
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

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

    it('records a permanent bounce when the relay rejects with a 5xx and rethrows', async () => {
        const rejection = Object.assign(new Error('550 5.1.1 User unknown'), { responseCode: 550 })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toThrow('550 5.1.1 User unknown')
        expect(recordBounce).toHaveBeenCalledWith({
            emailAddress: 'owner@business.com',
            type: BounceType.PERMANENT,
            statusCode: '550',
            reason: '550 5.1.1 User unknown',
            messageId: null,
            receivedAt: expect.any(Date) as Date,
        })
    })

    it('does not record a bounce for non-5xx transporter errors', async () => {
        const rejection = Object.assign(new Error('451 try again later'), { responseCode: 451 })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail, context)).rejects.toThrow('451 try again later')
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('still rejects with the transporter error when bounce recording itself fails', async () => {
        const rejection = Object.assign(new Error('550 rejected'), { responseCode: 550 })
        sendMail.mockRejectedValue(rejection)
        recordBounce.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail, context)).rejects.toThrow('550 rejected')
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
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.BLOCKED, blocked.message)
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('marks a transporter failure as failed', async () => {
        sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'))

        await expect(service.sendMail(mail, context)).rejects.toThrow(MailSendError)
        expect(markUnsent).toHaveBeenCalledWith(41, MailMessageStatus.FAILED, 'connect ECONNREFUSED')
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
