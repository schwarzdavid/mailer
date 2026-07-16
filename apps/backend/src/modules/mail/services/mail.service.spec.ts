import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Transporter } from 'nodemailer'
import { MailService, SendMail } from './mail.service'
import { MAIL_TRANSPORTER } from '../mail.constants'
import { DomainService } from '../../domain/services/domain.service'
import { DkimEncryptionService } from '../../domain/services/dkim-encryption.service'
import { Domain, DomainWithActiveDkim } from '../../domain/interfaces/domain.interface'
import { DomainDkimAlgorithm } from '../../domain/interfaces/domain-dkim.interface'
import { EmailBlockService } from '../../bounce/services/email-block.service'
import { BounceService } from '../../bounce/services/bounce.service'
import { BounceType } from '../../bounce/interfaces/bounce.interface'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception'

describe('MailService', () => {
    let service: MailService
    let sendMail: Mock<Transporter['sendMail']>
    let getSendingDomainByFqdn: Mock<DomainService['getSendingDomainByFqdn']>
    let getConfiguredSendingDomain: Mock<DomainService['getConfiguredSendingDomain']>
    let decryptDkimPrivateKey: Mock<DkimEncryptionService['decryptDkimPrivateKey']>
    let assertNotBlocked: Mock<EmailBlockService['assertNotBlocked']>
    let recordBounce: Mock<BounceService['recordBounce']>

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

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        sendMail = vi.fn<typeof sendMail>().mockResolvedValue({})
        getSendingDomainByFqdn = vi.fn<typeof getSendingDomainByFqdn>().mockResolvedValue(sendingDomain)
        getConfiguredSendingDomain = vi.fn<typeof getConfiguredSendingDomain>().mockResolvedValue(null)
        decryptDkimPrivateKey = vi.fn<typeof decryptDkimPrivateKey>().mockResolvedValue('-----BEGIN PRIVATE KEY-----')
        assertNotBlocked = vi.fn<typeof assertNotBlocked>().mockResolvedValue(undefined)
        recordBounce = vi.fn<typeof recordBounce>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MailService,
                { provide: MAIL_TRANSPORTER, useValue: { sendMail } },
                { provide: DomainService, useValue: { getSendingDomainByFqdn, getConfiguredSendingDomain } },
                { provide: DkimEncryptionService, useValue: { decryptDkimPrivateKey } },
                { provide: EmailBlockService, useValue: { assertNotBlocked } },
                { provide: BounceService, useValue: { recordBounce } },
            ],
        }).compile()

        service = module.get(MailService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('signs with the sending domain dkim key and hands the mail to the transporter', async () => {
        await service.sendMail(mail)

        expect(getSendingDomainByFqdn).toHaveBeenCalledWith('mail.example.com')
        expect(decryptDkimPrivateKey).toHaveBeenCalledWith('v1.encrypted-key')
        expect(sendMail).toHaveBeenCalledWith({
            from: 'noreply@mail.example.com',
            to: 'owner@business.com',
            replyTo: undefined,
            subject: 'New submission',
            html: '<p>Hello</p>',
            envelope: undefined,
            dkim: {
                domainName: 'mail.example.com',
                keySelector: 's1',
                privateKey: '-----BEGIN PRIVATE KEY-----',
            },
        })
    })

    it('passes replyTo through when set', async () => {
        await service.sendMail({ ...mail, replyTo: 'visitor@example.org' })

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'visitor@example.org' }))
    })

    it('rejects when no sending domain is configured for the from address', async () => {
        getSendingDomainByFqdn.mockResolvedValue(null)

        await expect(service.sendMail(mail)).rejects.toThrow('No sending domain configured for mail.example.com')
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('rejects a from address without a domain part', async () => {
        await expect(service.sendMail({ ...mail, from: 'broken-address' })).rejects.toThrow('Invalid from address')
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('refuses to send to a blocked recipient before touching the transporter', async () => {
        assertNotBlocked.mockRejectedValue(new EmailBlockedException('owner@business.com', new Date()))

        await expect(service.sendMail(mail)).rejects.toThrow(EmailBlockedException)
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

        await service.sendMail(mail)

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                envelope: { from: 'bounce@mail.sending-domain.org', to: 'owner@business.com' },
            }),
        )
    })

    it('sends without an envelope override when no sending domain is configured', async () => {
        await service.sendMail(mail)

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ envelope: undefined }))
    })

    it('records a permanent bounce when the relay rejects with a 5xx and rethrows', async () => {
        const rejection = Object.assign(new Error('550 5.1.1 User unknown'), { responseCode: 550 })
        sendMail.mockRejectedValue(rejection)

        await expect(service.sendMail(mail)).rejects.toThrow('550 5.1.1 User unknown')
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

        await expect(service.sendMail(mail)).rejects.toThrow('451 try again later')
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('still rejects with the transporter error when bounce recording itself fails', async () => {
        const rejection = Object.assign(new Error('550 rejected'), { responseCode: 550 })
        sendMail.mockRejectedValue(rejection)
        recordBounce.mockRejectedValue(new Error('db down'))

        await expect(service.sendMail(mail)).rejects.toThrow('550 rejected')
    })
})
