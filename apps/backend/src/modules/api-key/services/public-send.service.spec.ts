import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PublicSendService } from './public-send.service.js'
import { PublicSendErrorCode, PublicSendException } from '../exceptions/public-send.exception.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { ProjectService } from '../../project/services/project.service.js'
import { MailService } from '../../mail/services/mail.service.js'
import { MailSendError } from '../../mail/exceptions/mail-send.error.js'
import { MailMessageSource } from '../../mail/interfaces/mail-message.interface.js'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception.js'
import { Domain, DomainWithActiveDkim } from '../../domain/interfaces/domain.interface.js'
import { DomainDkimAlgorithm } from '../../domain/interfaces/domain-dkim.interface.js'
import { ApiKey } from '../interfaces/api-key.interface.js'
import { PublicSendDto } from '../dtos/public-send.dto.js'

const apiKey: ApiKey = {
    apiKeyId: 11,
    projectId: 3,
    name: 'Newsletter',
    prefix: 'sdm_abcdEFGH',
    createdByUserId: 7,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const domain: Domain = {
    domainId: 8,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    activeDkimId: 4,
    dnsRecords: [],
    lastCheckedAt: null,
}

const sendingDomain: DomainWithActiveDkim = {
    ...domain,
    activeDkim: {
        dkimId: 4,
        domainId: 8,
        selector: 's1',
        publicKey: 'pub',
        privateKey: 'v1.key',
        algorithm: DomainDkimAlgorithm.RSA,
        keyBits: 2048,
        createdAt: new Date(),
    },
}

const mail: PublicSendDto = {
    from: 'news@mail.example.com',
    to: 'reader@example.org',
    subject: 'Hello',
    html: '<p>Hi</p>',
}

describe('PublicSendService', () => {
    let service: PublicSendService
    let getDomainByFqdn: Mock<DomainService['getDomainByFqdn']>
    let getSendingDomainByFqdn: Mock<DomainService['getSendingDomainByFqdn']>
    let hasDomain: Mock<ProjectService['hasDomain']>
    let sendMail: Mock<MailService['sendMail']>

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        getDomainByFqdn = vi.fn<typeof getDomainByFqdn>().mockResolvedValue(domain)
        getSendingDomainByFqdn = vi.fn<typeof getSendingDomainByFqdn>().mockResolvedValue(sendingDomain)
        hasDomain = vi.fn<typeof hasDomain>().mockResolvedValue(true)
        sendMail = vi.fn<typeof sendMail>().mockResolvedValue({ mailMessageId: 70, smtpMessageId: '<m@x>' })

        const module = await Test.createTestingModule({
            providers: [
                PublicSendService,
                { provide: DomainService, useValue: { getDomainByFqdn, getSendingDomainByFqdn } },
                { provide: ProjectService, useValue: { hasDomain } },
                { provide: MailService, useValue: { sendMail } },
            ],
        }).compile()
        service = module.get(PublicSendService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function sendError(dto: PublicSendDto = mail): Promise<PublicSendException> {
        const error = await service.send(apiKey, dto).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(PublicSendException)
        return error as PublicSendException
    }

    it('sends through the mail service as an api message of the key project', async () => {
        await expect(service.send(apiKey, { ...mail, replyTo: 'support@example.com', text: 'Hi' })).resolves.toEqual({
            mailMessageId: 70,
        })

        expect(sendMail).toHaveBeenCalledWith(
            {
                from: 'news@mail.example.com',
                to: 'reader@example.org',
                replyTo: 'support@example.com',
                subject: 'Hello',
                html: '<p>Hi</p>',
                text: 'Hi',
            },
            { projectId: 3, source: MailMessageSource.API, apiKeyId: 11 },
        )
    })

    it('matches the from domain case-insensitively and sends with the normalized domain', async () => {
        await service.send(apiKey, { ...mail, from: 'News@Mail.Example.COM' })

        expect(getDomainByFqdn).toHaveBeenCalledWith('mail.example.com')
        expect(getSendingDomainByFqdn).toHaveBeenCalledWith('mail.example.com')
        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ from: 'News@mail.example.com' }),
            expect.anything(),
        )
    })

    it('forbids an unknown from domain without revealing that it is unknown', async () => {
        getDomainByFqdn.mockResolvedValue(null)

        const error = await sendError()
        expect(error.code).toBe(PublicSendErrorCode.FROM_DOMAIN_NOT_ALLOWED)
        expect(error.getStatus()).toBe(403)
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('forbids a from domain of another project', async () => {
        hasDomain.mockResolvedValue(false)

        const error = await sendError()
        expect(hasDomain).toHaveBeenCalledWith(3, 8)
        expect(error.code).toBe(PublicSendErrorCode.FROM_DOMAIN_NOT_ALLOWED)
    })

    it('rejects a project domain without an active dkim key', async () => {
        getSendingDomainByFqdn.mockResolvedValue(null)

        const error = await sendError()
        expect(error.code).toBe(PublicSendErrorCode.FROM_DOMAIN_NOT_READY)
        expect(error.getStatus()).toBe(422)
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('reports a blocked recipient', async () => {
        sendMail.mockRejectedValue(
            new MailSendError(71, new EmailBlockedException('reader@example.org', new Date('2026-11-01'))),
        )

        const error = await sendError()
        expect(error.code).toBe(PublicSendErrorCode.RECIPIENT_BLOCKED)
        expect(error.getStatus()).toBe(422)
        expect(error.mailMessageId).toBe(71)
    })

    it('reports a delivery failure with the logged message id', async () => {
        sendMail.mockRejectedValue(new MailSendError(72, new Error('connect ECONNREFUSED')))

        const error = await sendError()
        expect(error.code).toBe(PublicSendErrorCode.DELIVERY_FAILED)
        expect(error.getStatus()).toBe(502)
        expect(error.getResponse()).toEqual(expect.objectContaining({ mailMessageId: 72 }))
    })

    it('logs a delivery failure by its codes without the relay message', async () => {
        const logWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        sendMail.mockRejectedValue(
            new MailSendError(
                73,
                Object.assign(new Error('550 5.1.1 <reader@example.org>: unknown user'), {
                    code: 'EENVELOPE',
                    responseCode: 550,
                }),
            ),
        )

        await sendError()

        expect(logWarn).toHaveBeenCalledExactlyOnceWith(
            `API key ${apiKey.prefix} delivery 73 failed: MailSendError caused by Error (code EENVELOPE, responseCode 550)`,
        )
    })

    it('rethrows errors that happen before a message was logged', async () => {
        sendMail.mockRejectedValue(new Error('db down'))

        await expect(service.send(apiKey, mail)).rejects.toThrow('db down')
    })
})
