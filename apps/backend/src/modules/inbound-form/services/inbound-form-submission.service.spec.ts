import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { Sequelize } from 'sequelize-typescript'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormSubmissionService, PublicSubmission } from './inbound-form-submission.service'
import { ProjectModel } from '../../project/models/project.model'
import { InboundFormModel } from '../models/inbound-form.model'
import { InboundFormFieldModel } from '../models/inbound-form-field.model'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model'
import { InboundFormSubmissionModel } from '../models/inbound-form-submission.model'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model'
import { InboundFormSecurityService, SecurityCheckResult } from './inbound-form-security.service'
import { InboundFormTemplateService } from './inbound-form-template.service'
import { TemplateRendererService } from '../../mail/services/template-renderer.service'
import { MailService } from '../../mail/services/mail.service'
import { InboundFormFull } from '../interfaces/inbound-form.interface'
import { InboundFormField, InboundFormFieldType } from '../interfaces/inbound-form-field.interface'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface'
import {
    InboundFormSubmission,
    InboundFormSubmissionCreate,
    InboundFormSubmissionStatus,
} from '../interfaces/inbound-form-submission.interface'
import {
    InboundFormDelivery,
    InboundFormDeliveryCreate,
    InboundFormDeliveryStatus,
} from '../interfaces/inbound-form-delivery.interface'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface'

const emailField: InboundFormField = {
    inboundFormFieldId: 21,
    inboundFormId: 1,
    key: 'email',
    label: 'Email',
    type: InboundFormFieldType.EMAIL,
    defaultValue: null,
    validation: { required: true },
    createdAt: new Date(),
    updatedAt: new Date(),
}

const nameField: InboundFormField = {
    ...emailField,
    inboundFormFieldId: 22,
    key: 'firstName',
    label: 'First name',
    type: InboundFormFieldType.TEXT,
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

const formFull: InboundFormFull = {
    inboundFormId: 1,
    projectId: 5,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    inboundFormFields: [emailField, nameField],
    inboundFormReceivers: [ownerReceiver, confirmationReceiver],
    inboundFormSecurity: [],
}

const submission: PublicSubmission = {
    security: {},
    data: { email: 'max@example.com', firstName: 'Max' },
}

type DeliveryRow = InboundFormDelivery & {
    update: Mock<(values: Partial<InboundFormDelivery>) => Promise<unknown>>
}

describe('InboundFormSubmissionService', () => {
    let service: InboundFormSubmissionService
    let formFindOne: Mock<(typeof InboundFormModel)['findOne']>
    let submissionCreate: Mock<
        (
            values: InboundFormSubmissionCreate,
            options: { returning: true; transaction?: unknown },
        ) => Promise<InboundFormSubmissionModel>
    >
    let deliveryCreate: Mock<
        (
            values: InboundFormDeliveryCreate,
            options: { returning: true; transaction?: unknown },
        ) => Promise<InboundFormDeliveryModel>
    >
    let checkSubmission: Mock<InboundFormSecurityService['checkSubmission']>
    let getPublished: Mock<InboundFormTemplateService['getPublished']>
    let sendMail: Mock<MailService['sendMail']>
    let transaction: Mock<(callback: (t: unknown) => PromiseLike<unknown>) => Promise<unknown>>
    let deliveryRows: DeliveryRow[]

    function mockForm(form: InboundFormFull | null) {
        formFindOne.mockResolvedValue(
            form
                ? ({
                      ...form,
                      inboundFormFields: form.inboundFormFields.map((field) => ({
                          ...field,
                          get: () => field,
                      })),
                      inboundFormSecurity: [],
                      inboundFormReceivers: form.inboundFormReceivers.map((receiver) => ({
                          ...receiver,
                          get: () => receiver,
                      })),
                      get: () => form,
                  } as unknown as InboundFormModel)
                : null,
        )
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        deliveryRows = []
        formFindOne = vi.fn<typeof formFindOne>()
        submissionCreate = vi.fn<typeof submissionCreate>().mockImplementation((values) => {
            const row: InboundFormSubmission = {
                inboundFormSubmissionId: 91,
                createdAt: new Date(),
                ...(values as Omit<InboundFormSubmission, 'inboundFormSubmissionId' | 'createdAt'>),
            }
            return Promise.resolve({ ...row, get: () => row } as unknown as InboundFormSubmissionModel)
        })
        deliveryCreate = vi.fn<typeof deliveryCreate>().mockImplementation((values) => {
            const row = {
                inboundFormDeliveryId: deliveryRows.length + 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...(values as Omit<InboundFormDelivery, 'inboundFormDeliveryId' | 'createdAt' | 'updatedAt'>),
                update: vi.fn<DeliveryRow['update']>().mockResolvedValue(null),
            } as DeliveryRow
            deliveryRows.push(row)
            return Promise.resolve(row as unknown as InboundFormDeliveryModel)
        })
        checkSubmission = vi.fn<typeof checkSubmission>().mockResolvedValue(SecurityCheckResult.PASSED)
        getPublished = vi.fn<typeof getPublished>().mockResolvedValue(publishedTemplate)
        sendMail = vi.fn<typeof sendMail>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation(async (callback: (t: unknown) => PromiseLike<unknown>) => callback(null))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormSubmissionService,
                TemplateRendererService,
                { provide: getModelToken(InboundFormModel), useValue: { findOne: formFindOne } },
                { provide: getModelToken(InboundFormSubmissionModel), useValue: { create: submissionCreate } },
                { provide: getModelToken(InboundFormDeliveryModel), useValue: { create: deliveryCreate } },
                { provide: InboundFormSecurityService, useValue: { checkSubmission } },
                { provide: InboundFormTemplateService, useValue: { getPublished } },
                { provide: MailService, useValue: { sendMail } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(InboundFormSubmissionService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('throws NotFoundException for an unknown or inactive slug', async () => {
        mockForm(null)

        await expect(service.submitForm('nope', submission, {}, {})).rejects.toThrow(NotFoundException)
        expect(formFindOne).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'nope', isActive: true } }))
    })

    it('requires a live project on the form lookup', async () => {
        formFindOne.mockResolvedValue(null)

        await expect(service.submitForm('contact', {}, {}, {})).rejects.toThrow(new NotFoundException('Unknown form'))

        expect(formFindOne).toHaveBeenCalledWith({
            where: { slug: 'contact', isActive: true },
            include: [
                InboundFormFieldModel,
                InboundFormSecurityModel,
                InboundFormReceiverModel,
                { model: ProjectModel, required: true },
            ],
        })
    })

    it('rejects invalid data with a BadRequestException and stores nothing', async () => {
        mockForm(formFull)

        await expect(service.submitForm('contact', { data: { email: 'broken' } }, {}, {})).rejects.toThrow(
            BadRequestException,
        )
        expect(submissionCreate).not.toHaveBeenCalled()
    })

    it('stores a spam submission without deliveries and sends nothing', async () => {
        mockForm(formFull)
        checkSubmission.mockResolvedValue(SecurityCheckResult.SPAM)

        await service.submitForm('contact', submission, {}, {})

        expect(submissionCreate).toHaveBeenCalledWith(
            expect.objectContaining({ status: InboundFormSubmissionStatus.SPAM }),
            expect.anything(),
        )
        expect(deliveryCreate).not.toHaveBeenCalled()
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('stores a spam submission with the raw payload even when validation would fail', async () => {
        mockForm(formFull)
        checkSubmission.mockResolvedValue(SecurityCheckResult.SPAM)

        await expect(service.submitForm('contact', { data: { firstName: 'Max' } }, {}, {})).resolves.toBeUndefined()

        expect(submissionCreate).toHaveBeenCalledWith(
            expect.objectContaining({ status: InboundFormSubmissionStatus.SPAM, data: { firstName: 'Max' } }),
            expect.anything(),
        )
        expect(deliveryCreate).not.toHaveBeenCalled()
        expect(sendMail).not.toHaveBeenCalled()
    })

    it('accepts a submission, renders templates and sends one mail per receiver', async () => {
        mockForm(formFull)

        await service.submitForm('contact', submission, {}, {})
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(2))

        expect(submissionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: InboundFormSubmissionStatus.ACCEPTED,
                data: { email: 'max@example.com', firstName: 'Max' },
            }),
            expect.anything(),
        )
        expect(sendMail).toHaveBeenCalledWith({
            from: 'noreply@mail.example.com',
            to: 'owner@business.com',
            replyTo: 'max@example.com',
            subject: 'Message from Max',
            html: '<p>Max wrote in</p>',
        })
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'max@example.com', replyTo: undefined }))
        expect(deliveryCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: InboundFormDeliveryStatus.PENDING,
                emailFrom: 'noreply@mail.example.com',
                emailTo: '{{email}}',
                error: null,
                sentAt: null,
            }),
            expect.anything(),
        )
        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: InboundFormDeliveryStatus.SENT, emailTo: 'owner@business.com' }),
            ),
        )
    })

    it('skips receivers without a published template', async () => {
        mockForm(formFull)
        getPublished.mockImplementation((receiverId) => Promise.resolve(receiverId === 31 ? publishedTemplate : null))

        await service.submitForm('contact', submission, {}, {})
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1))

        expect(deliveryCreate).toHaveBeenCalledTimes(1)
    })

    it('skips inactive receivers', async () => {
        mockForm({
            ...formFull,
            inboundFormReceivers: [ownerReceiver, { ...confirmationReceiver, isActive: false }],
        })

        await service.submitForm('contact', submission, {}, {})
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1))
    })

    it('marks a delivery failed when sending throws', async () => {
        mockForm({ ...formFull, inboundFormReceivers: [ownerReceiver] })
        sendMail.mockRejectedValue(new Error('SMTP down'))

        await service.submitForm('contact', submission, {}, {})

        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: InboundFormDeliveryStatus.FAILED, error: 'SMTP down' }),
            ),
        )
    })

    it('marks a delivery failed when its template does not render while others still send', async () => {
        mockForm(formFull)
        getPublished.mockImplementation((receiverId) =>
            Promise.resolve(
                receiverId === 31
                    ? { ...publishedTemplate, template: '{{#if}}' }
                    : { ...publishedTemplate, inboundFormTemplateId: 42, inboundFormReceiverId: 32 },
            ),
        )

        await service.submitForm('contact', submission, {}, {})
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1))

        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'max@example.com' }))
        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: InboundFormDeliveryStatus.FAILED }),
            ),
        )
        expect(typeof deliveryRows[0]!.update.mock.calls[0]![0].error).toBe('string')
        await vi.waitFor(() =>
            expect(deliveryRows[1]!.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: InboundFormDeliveryStatus.SENT, emailTo: 'max@example.com' }),
            ),
        )
    })

    it('marks a delivery failed when a placeholder recipient is empty', async () => {
        mockForm({
            ...formFull,
            inboundFormFields: [{ ...emailField, validation: null }, nameField],
            inboundFormReceivers: [confirmationReceiver],
        })

        await service.submitForm('contact', { data: { firstName: 'Max' } }, {}, {})

        await vi.waitFor(() =>
            expect(deliveryRows[0]!.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: InboundFormDeliveryStatus.FAILED,
                    error: 'Recipient field "email" is empty',
                }),
            ),
        )
        expect(sendMail).not.toHaveBeenCalled()
    })
})
