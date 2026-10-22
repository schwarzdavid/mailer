import { Logger } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import type { FindOptions } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormDeliveryService } from './inbound-form-delivery.service.js'
import { InboundFormModel } from '../models/inbound-form.model.js'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model.js'
import { InboundFormTemplateModel } from '../models/inbound-form-template.model.js'
import { InboundFormSubmissionModel } from '../models/inbound-form-submission.model.js'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model.js'
import { TemplateRendererService } from '../../mail/services/template-renderer.service.js'
import { MailService } from '../../mail/services/mail.service.js'
import { MailSendError } from '../../mail/exceptions/mail-send.error.js'
import { MailMessageSource } from '../../mail/interfaces/mail-message.interface.js'
import { InboundForm } from '../interfaces/inbound-form.interface.js'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface.js'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface.js'
import { InboundFormSubmission, InboundFormSubmissionStatus } from '../interfaces/inbound-form-submission.interface.js'
import { InboundFormDelivery, InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface.js'

const form: InboundForm = {
    inboundFormId: 1,
    projectId: 5,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    allowedHostnames: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

const ownerReceiver: InboundFormReceiver = {
    inboundFormReceiverId: 31,
    inboundFormId: 1,
    emailFrom: 'noreply@mail.example.com',
    emailReceiver: 'owner@business.com',
    emailReplyTo: '{{email}}',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const confirmationReceiver: InboundFormReceiver = {
    ...ownerReceiver,
    inboundFormReceiverId: 32,
    emailReceiver: '{{email}}',
    emailReplyTo: null,
}

const publishedTemplate: InboundFormTemplate = {
    inboundFormTemplateId: 41,
    inboundFormReceiverId: 31,
    subject: 'Message from {{firstName}}',
    template: '<p>{{firstName}} wrote in</p>',
    status: InboundFormTemplateStatus.PUBLISHED,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const acceptedSubmission: InboundFormSubmission = {
    inboundFormSubmissionId: 91,
    inboundFormId: 1,
    data: { email: 'max@example.com', firstName: 'Max' },
    status: InboundFormSubmissionStatus.ACCEPTED,
    createdAt: new Date(),
}

const pendingDelivery: InboundFormDelivery = {
    inboundFormDeliveryId: 7,
    inboundFormSubmissionId: 91,
    inboundFormReceiverId: 31,
    inboundFormTemplateId: 41,
    emailFrom: 'noreply@mail.example.com',
    emailTo: 'owner@business.com',
    status: InboundFormDeliveryStatus.PENDING,
    attempts: 0,
    error: null,
    sentAt: null,
    mailMessageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}

type DeliveryRow = InboundFormDelivery & {
    submission: (InboundFormSubmission & { inboundForm: InboundForm | null }) | null
    receiver: InboundFormReceiver | null
    template: InboundFormTemplate | null
    update: Mock<(values: Partial<InboundFormDelivery>) => Promise<unknown>>
}

interface DeliveryRowOverrides {
    delivery?: Partial<InboundFormDelivery>
    data?: Record<string, unknown>
    receiver?: InboundFormReceiver | null
    template?: InboundFormTemplate | null
}

function transientError(mailMessageId: number): MailSendError {
    return new MailSendError(
        mailMessageId,
        Object.assign(new Error('421 4.7.0 Try again later for <owner@business.com>'), { responseCode: 421 }),
    )
}

describe('InboundFormDeliveryService', () => {
    let service: InboundFormDeliveryService
    let findByPk: Mock<(id: number, options: FindOptions) => Promise<DeliveryRow | null>>
    let sendMail: Mock<MailService['sendMail']>
    let logError: Mock<Logger['error']>
    let logWarn: Mock<Logger['warn']>

    function mockDelivery(overrides: DeliveryRowOverrides = {}): DeliveryRow {
        const row: DeliveryRow = {
            ...pendingDelivery,
            ...overrides.delivery,
            submission: { ...acceptedSubmission, data: overrides.data ?? acceptedSubmission.data, inboundForm: form },
            receiver: overrides.receiver === undefined ? ownerReceiver : overrides.receiver,
            template: overrides.template === undefined ? publishedTemplate : overrides.template,
            update: vi.fn<DeliveryRow['update']>().mockResolvedValue(null),
        }
        findByPk.mockResolvedValue(row)
        return row
    }

    beforeEach(async () => {
        logError = vi.fn<Logger['error']>()
        logWarn = vi.fn<Logger['warn']>()
        vi.spyOn(Logger.prototype, 'error').mockImplementation(logError)
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(logWarn)

        findByPk = vi.fn<typeof findByPk>().mockResolvedValue(null)
        sendMail = vi.fn<typeof sendMail>().mockResolvedValue({ mailMessageId: 501, smtpMessageId: '<m@x>' })

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormDeliveryService,
                TemplateRendererService,
                { provide: getModelToken(InboundFormDeliveryModel), useValue: { findByPk } },
                { provide: MailService, useValue: { sendMail } },
            ],
        }).compile()

        service = module.get(InboundFormDeliveryService)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('loads the delivery with its submission, form, receiver and template', async () => {
        mockDelivery()

        await service.deliver(7, false)

        expect(findByPk).toHaveBeenCalledWith(7, {
            include: [
                { model: InboundFormSubmissionModel, include: [InboundFormModel] },
                InboundFormReceiverModel,
                InboundFormTemplateModel,
            ],
        })
    })

    it('renders the template, sends the mail and marks the delivery sent', async () => {
        const now = new Date('2026-10-22T12:00:00.000Z')
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(now)
        const row = mockDelivery()

        await service.deliver(7, false)

        expect(sendMail).toHaveBeenCalledExactlyOnceWith(
            {
                from: 'noreply@mail.example.com',
                to: 'owner@business.com',
                replyTo: 'max@example.com',
                subject: 'Message from Max',
                html: '<p>Max wrote in</p>',
            },
            { projectId: form.projectId, source: MailMessageSource.INBOUND_FORM },
        )
        expect(row.update).toHaveBeenCalledExactlyOnceWith({
            status: InboundFormDeliveryStatus.SENT,
            emailTo: 'owner@business.com',
            sentAt: now,
            mailMessageId: 501,
            attempts: 1,
            error: null,
        })
    })

    it('resolves a placeholder recipient from the submission and leaves reply-to unset', async () => {
        const row = mockDelivery({ receiver: confirmationReceiver, delivery: { emailTo: '{{email}}' } })

        await service.deliver(7, false)

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'max@example.com', replyTo: undefined }),
            expect.anything(),
        )
        expect(row.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: InboundFormDeliveryStatus.SENT, emailTo: 'max@example.com' }),
        )
    })

    it('counts the attempt on top of earlier ones', async () => {
        const row = mockDelivery({ delivery: { attempts: 3, error: 'earlier failure' } })

        await service.deliver(7, false)

        expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ attempts: 4, error: null }))
    })

    it('renders the subject without html escaping', async () => {
        mockDelivery({ data: { email: 'max@example.com', firstName: "O'Brien & Co" } })

        await service.deliver(7, false)

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                subject: "Message from O'Brien & Co",
                html: '<p>O&#x27;Brien &amp; Co wrote in</p>',
            }),
            expect.anything(),
        )
    })

    it.each([InboundFormDeliveryStatus.SENT, InboundFormDeliveryStatus.FAILED])(
        'returns without sending when the delivery is already %s',
        async (status) => {
            const row = mockDelivery({ delivery: { status } })

            await expect(service.deliver(7, false)).resolves.toBeUndefined()

            expect(sendMail).not.toHaveBeenCalled()
            expect(row.update).not.toHaveBeenCalled()
        },
    )

    it('returns without sending when the delivery no longer exists', async () => {
        await expect(service.deliver(7, false)).resolves.toBeUndefined()

        expect(sendMail).not.toHaveBeenCalled()
    })

    it.each<[string, DeliveryRowOverrides, string]>([
        ['the receiver was deleted', { receiver: null }, 'Receiver was deleted'],
        ['the template was deleted', { template: null }, 'Template was deleted'],
        [
            'the placeholder recipient is empty',
            { receiver: confirmationReceiver, data: { firstName: 'Max' } },
            'Recipient field "email" is empty',
        ],
    ])('marks the delivery failed without retrying when %s', async (_label, overrides, error) => {
        const row = mockDelivery(overrides)

        await expect(service.deliver(7, false)).resolves.toBeUndefined()

        expect(sendMail).not.toHaveBeenCalled()
        expect(row.update).toHaveBeenCalledExactlyOnceWith({
            status: InboundFormDeliveryStatus.FAILED,
            error,
            attempts: 1,
            mailMessageId: null,
        })
    })

    it('marks the delivery failed without retrying when its template does not render', async () => {
        const row = mockDelivery({ template: { ...publishedTemplate, template: '{{#if}}' } })

        await expect(service.deliver(7, false)).resolves.toBeUndefined()

        expect(sendMail).not.toHaveBeenCalled()
        expect(row.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: InboundFormDeliveryStatus.FAILED, attempts: 1, mailMessageId: null }),
        )
        expect(typeof row.update.mock.calls[0]![0].error).toBe('string')
    })

    it('marks the delivery failed and links the logged message when the relay rejects it permanently', async () => {
        const row = mockDelivery()
        sendMail.mockRejectedValue(
            new MailSendError(502, Object.assign(new Error('550 5.1.1 unknown user'), { responseCode: 550 })),
        )

        await expect(service.deliver(7, false)).resolves.toBeUndefined()

        expect(row.update).toHaveBeenCalledExactlyOnceWith({
            status: InboundFormDeliveryStatus.FAILED,
            error: '550 5.1.1 unknown user',
            attempts: 1,
            mailMessageId: 502,
        })
    })

    it('keeps the delivery pending and rethrows a temporary relay error so the queue retries', async () => {
        const row = mockDelivery()
        const error = transientError(503)
        sendMail.mockRejectedValue(error)

        await expect(service.deliver(7, false)).rejects.toBe(error)

        expect(row.update).toHaveBeenCalledExactlyOnceWith({
            status: InboundFormDeliveryStatus.PENDING,
            error: '421 4.7.0 Try again later for <owner@business.com>',
            attempts: 1,
            mailMessageId: 503,
        })
    })

    it('marks the delivery failed and rethrows a temporary relay error on the last attempt', async () => {
        const row = mockDelivery({ delivery: { attempts: 7 } })
        const error = transientError(504)
        sendMail.mockRejectedValue(error)

        await expect(service.deliver(7, true)).rejects.toBe(error)

        expect(row.update).toHaveBeenCalledExactlyOnceWith({
            status: InboundFormDeliveryStatus.FAILED,
            error: '421 4.7.0 Try again later for <owner@business.com>',
            attempts: 8,
            mailMessageId: 504,
        })
    })

    it.each<[boolean, InboundFormDeliveryStatus]>([
        [false, InboundFormDeliveryStatus.PENDING],
        [true, InboundFormDeliveryStatus.FAILED],
    ])(
        'treats a failure inside the mail service before the mail was logged as temporary (last attempt: %s)',
        async (isLastAttempt, status) => {
            const row = mockDelivery()
            const error = new Error('Connection terminated unexpectedly')
            sendMail.mockRejectedValue(error)

            await expect(service.deliver(7, isLastAttempt)).rejects.toBe(error)

            expect(row.update).toHaveBeenCalledExactlyOnceWith({
                status,
                error: 'Connection terminated unexpectedly',
                attempts: 1,
                mailMessageId: null,
            })
        },
    )

    it('keeps a render error permanent on every attempt although it is not a mail error', async () => {
        const row = mockDelivery({ template: { ...publishedTemplate, subject: '{{#each}}' } })

        await expect(service.deliver(7, false)).resolves.toBeUndefined()

        expect(sendMail).not.toHaveBeenCalled()
        expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: InboundFormDeliveryStatus.FAILED }))
    })

    it('logs failures by delivery id and error codes without any address', async () => {
        mockDelivery()
        sendMail.mockRejectedValueOnce(transientError(503))
        await expect(service.deliver(7, false)).rejects.toThrow()

        mockDelivery({ receiver: confirmationReceiver, data: { firstName: 'Max' } })
        await service.deliver(7, false)

        expect(logWarn).toHaveBeenCalledWith(
            'Delivery 7 attempt 1 failed, retrying: MailSendError caused by Error (responseCode 421)',
        )
        expect(logError).toHaveBeenCalledWith('Delivery 7 attempt 1 failed: Error')
        for (const [message] of [...logWarn.mock.calls, ...logError.mock.calls]) {
            expect(String(message)).not.toContain('@')
        }
    })
})
