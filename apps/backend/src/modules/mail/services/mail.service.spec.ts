import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Transporter } from 'nodemailer'
import { MailService, SendMail } from './mail.service'
import { MAIL_TRANSPORTER } from '../mail.constants'
import { DomainService } from '../../domain/services/domain.service'
import { DkimEncryptionService } from '../../domain/services/dkim-encryption.service'
import { DomainWithActiveDkim } from '../../domain/interfaces/domain.interface'
import { DomainDkimAlgorithm } from '../../domain/interfaces/domain-dkim.interface'

describe('MailService', () => {
    let service: MailService
    let sendMail: Mock<Transporter['sendMail']>
    let getSendingDomainByFqdn: Mock<DomainService['getSendingDomainByFqdn']>
    let decryptDkimPrivateKey: Mock<DkimEncryptionService['decryptDkimPrivateKey']>

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
        sendMail = vi.fn<typeof sendMail>().mockResolvedValue({})
        getSendingDomainByFqdn = vi.fn<typeof getSendingDomainByFqdn>().mockResolvedValue(sendingDomain)
        decryptDkimPrivateKey = vi.fn<typeof decryptDkimPrivateKey>().mockResolvedValue('-----BEGIN PRIVATE KEY-----')

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MailService,
                { provide: MAIL_TRANSPORTER, useValue: { sendMail } },
                { provide: DomainService, useValue: { getSendingDomainByFqdn } },
                { provide: DkimEncryptionService, useValue: { decryptDkimPrivateKey } },
            ],
        }).compile()

        service = module.get(MailService)
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
})
