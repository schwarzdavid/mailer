import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { Sequelize } from 'sequelize-typescript'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormSubmissionService, PublicSubmission } from './inbound-form-submission.service.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { InboundFormModel } from '../models/inbound-form.model.js'
import { InboundFormFieldModel } from '../models/inbound-form-field.model.js'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model.js'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model.js'
import { InboundFormSubmissionModel } from '../models/inbound-form-submission.model.js'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model.js'
import { InboundFormSecurityService, SecurityCheckResult } from './inbound-form-security.service.js'
import { InboundFormTemplateService } from './inbound-form-template.service.js'
import { InboundFormTokenService } from './inbound-form-token.service.js'
import { InboundFormDeliveryQueueService } from './inbound-form-delivery-queue.service.js'
import { EnqueueTimeoutError } from '../exceptions/enqueue-timeout.error.js'
import { INCLUDED_FIELD_ORDER } from '../helpers/field-order.js'
import { InboundFormFull } from '../interfaces/inbound-form.interface.js'
import { InboundFormField, InboundFormFieldType } from '../interfaces/inbound-form-field.interface.js'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface.js'
import {
    InboundFormSubmission,
    InboundFormSubmissionCreate,
    InboundFormSubmissionStatus,
} from '../interfaces/inbound-form-submission.interface.js'
import {
    InboundFormDelivery,
    InboundFormDeliveryCreate,
    InboundFormDeliveryStatus,
} from '../interfaces/inbound-form-delivery.interface.js'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface.js'
import {
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
    InboundFormTimedTokenConfig,
} from '../interfaces/inbound-form-security.interface.js'
import { IssuedFormToken, VerifiedFormToken } from '../interfaces/inbound-form-token.interface.js'

const emailField: InboundFormField = {
    inboundFormFieldId: 21,
    inboundFormId: 1,
    key: 'email',
    label: 'Email',
    type: InboundFormFieldType.EMAIL,
    defaultValue: null,
    validation: { required: true },
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const nameField: InboundFormField = {
    ...emailField,
    inboundFormFieldId: 22,
    key: 'firstName',
    label: 'First name',
    type: InboundFormFieldType.TEXT,
    position: 1,
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
    allowedHostnames: [],
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
    let enqueue: Mock<InboundFormDeliveryQueueService['enqueue']>
    let transaction: Mock<(callback: (t: unknown) => PromiseLike<unknown>) => Promise<unknown>>
    let issue: Mock<InboundFormTokenService['issue']>
    let consume: Mock<InboundFormTokenService['consume']>

    function mockForm(form: InboundFormFull | null) {
        formFindOne.mockResolvedValue(
            form
                ? ({
                      ...form,
                      inboundFormFields: form.inboundFormFields.map((field) => ({
                          ...field,
                          get: () => field,
                      })),
                      inboundFormSecurity: form.inboundFormSecurity.map((scheme) => ({
                          ...scheme,
                          get: () => scheme,
                      })),
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
            const row: InboundFormDelivery = {
                inboundFormDeliveryId: deliveryCreate.mock.calls.length,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...values,
            }
            return Promise.resolve(row as unknown as InboundFormDeliveryModel)
        })
        checkSubmission = vi
            .fn<typeof checkSubmission>()
            .mockResolvedValue({ result: SecurityCheckResult.PASSED, token: null })
        getPublished = vi.fn<typeof getPublished>().mockResolvedValue(publishedTemplate)
        enqueue = vi.fn<typeof enqueue>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation(async (callback: (t: unknown) => PromiseLike<unknown>) => callback(null))
        issue = vi.fn<typeof issue>()
        consume = vi.fn<typeof consume>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormSubmissionService,
                { provide: getModelToken(InboundFormModel), useValue: { findOne: formFindOne } },
                { provide: getModelToken(InboundFormSubmissionModel), useValue: { create: submissionCreate } },
                { provide: getModelToken(InboundFormDeliveryModel), useValue: { create: deliveryCreate } },
                { provide: InboundFormSecurityService, useValue: { checkSubmission } },
                { provide: InboundFormTemplateService, useValue: { getPublished } },
                { provide: InboundFormDeliveryQueueService, useValue: { enqueue } },
                { provide: Sequelize, useValue: { transaction } },
                { provide: InboundFormTokenService, useValue: { issue, consume } },
            ],
        }).compile()

        service = module.get(InboundFormSubmissionService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('throws NotFoundException for an unknown or inactive slug', async () => {
        mockForm(null)

        await expect(service.submitForm('nope', submission, {}, {}, '')).rejects.toThrow(NotFoundException)
        expect(formFindOne).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'nope', isActive: true } }))
    })

    it('requires a live project on the form lookup', async () => {
        formFindOne.mockResolvedValue(null)

        await expect(service.submitForm('contact', {}, {}, {}, '')).rejects.toThrow(
            new NotFoundException('Unknown form'),
        )

        expect(formFindOne).toHaveBeenCalledWith({
            where: { slug: 'contact', isActive: true },
            include: [
                InboundFormFieldModel,
                InboundFormSecurityModel,
                InboundFormReceiverModel,
                { model: ProjectModel, required: true },
            ],
            order: INCLUDED_FIELD_ORDER,
        })
    })

    it('rejects invalid data with a BadRequestException and stores nothing', async () => {
        mockForm(formFull)

        await expect(service.submitForm('contact', { data: { email: 'broken' } }, {}, {}, '')).rejects.toThrow(
            BadRequestException,
        )
        expect(submissionCreate).not.toHaveBeenCalled()
    })

    it('stores a spam submission without deliveries and sends nothing', async () => {
        mockForm(formFull)
        checkSubmission.mockResolvedValue({ result: SecurityCheckResult.SPAM })

        await service.submitForm('contact', submission, {}, {}, '')

        expect(submissionCreate).toHaveBeenCalledWith(
            expect.objectContaining({ status: InboundFormSubmissionStatus.SPAM }),
            expect.anything(),
        )
        expect(deliveryCreate).not.toHaveBeenCalled()
        expect(enqueue).not.toHaveBeenCalled()
    })

    it('stores a spam submission with the raw payload even when validation would fail', async () => {
        mockForm(formFull)
        checkSubmission.mockResolvedValue({ result: SecurityCheckResult.SPAM })

        await expect(service.submitForm('contact', { data: { firstName: 'Max' } }, {}, {}, '')).resolves.toBeUndefined()

        expect(submissionCreate).toHaveBeenCalledWith(
            expect.objectContaining({ status: InboundFormSubmissionStatus.SPAM, data: { firstName: 'Max' } }),
            expect.anything(),
        )
        expect(deliveryCreate).not.toHaveBeenCalled()
        expect(enqueue).not.toHaveBeenCalled()
    })

    it('creates one pending delivery per active receiver with a published template and enqueues each id after the transaction', async () => {
        mockForm(formFull)
        let committed = false
        const committedWhenEnqueued: boolean[] = []
        transaction.mockImplementation(async (callback: (t: unknown) => PromiseLike<unknown>) => {
            const result = await callback(null)
            committed = true
            return result
        })
        enqueue.mockImplementation(() => {
            committedWhenEnqueued.push(committed)
            return Promise.resolve()
        })

        await expect(service.submitForm('contact', submission, {}, {}, '')).resolves.toBeUndefined()

        expect(submissionCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: InboundFormSubmissionStatus.ACCEPTED,
                data: { email: 'max@example.com', firstName: 'Max' },
            }),
            expect.anything(),
        )
        expect(deliveryCreate.mock.calls.map(([values]) => values)).toEqual([
            {
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
            },
            {
                inboundFormSubmissionId: 91,
                inboundFormReceiverId: 32,
                inboundFormTemplateId: 41,
                emailFrom: 'noreply@mail.example.com',
                emailTo: '{{email}}',
                status: InboundFormDeliveryStatus.PENDING,
                attempts: 0,
                error: null,
                sentAt: null,
                mailMessageId: null,
            },
        ])
        expect(enqueue.mock.calls).toEqual([[1], [2]])
        expect(committedWhenEnqueued).toEqual([true, true])
    })

    it('skips receivers without a published template', async () => {
        mockForm(formFull)
        getPublished.mockImplementation((receiverId) => Promise.resolve(receiverId === 31 ? publishedTemplate : null))

        await service.submitForm('contact', submission, {}, {}, '')

        expect(deliveryCreate).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ inboundFormReceiverId: 31 }),
            expect.anything(),
        )
        expect(enqueue.mock.calls).toEqual([[1]])
    })

    it('skips inactive receivers', async () => {
        mockForm({
            ...formFull,
            inboundFormReceivers: [ownerReceiver, { ...confirmationReceiver, isActive: false }],
        })

        await service.submitForm('contact', submission, {}, {}, '')

        expect(deliveryCreate).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ inboundFormReceiverId: 31 }),
            expect.anything(),
        )
        expect(enqueue.mock.calls).toEqual([[1]])
    })

    it('logs a failed enqueue, continues with the next delivery and still accepts the submission', async () => {
        const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        mockForm(formFull)
        enqueue.mockRejectedValueOnce(
            Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379'), { code: 'ECONNREFUSED' }),
        )

        await expect(service.submitForm('contact', submission, {}, {}, '')).resolves.toBeUndefined()

        expect(enqueue.mock.calls).toEqual([[1], [2]])
        expect(logError).toHaveBeenCalledExactlyOnceWith('Enqueuing delivery 1 failed: Error (code ECONNREFUSED)')
    })

    it('leaves the remaining deliveries to the recovery sweep after an enqueue timeout', async () => {
        const logWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        mockForm({
            ...formFull,
            inboundFormReceivers: [
                ownerReceiver,
                confirmationReceiver,
                { ...confirmationReceiver, inboundFormReceiverId: 33 },
            ],
        })
        enqueue.mockRejectedValueOnce(new EnqueueTimeoutError('Enqueuing timed out after 2000 ms'))

        await expect(service.submitForm('contact', submission, {}, {}, '')).resolves.toBeUndefined()

        expect(deliveryCreate).toHaveBeenCalledTimes(3)
        expect(enqueue.mock.calls).toEqual([[1]])
        expect(logWarn).toHaveBeenCalledExactlyOnceWith(
            'Enqueuing timed out, left 3 deliveries to the recovery sweep: 1, 2, 3',
        )
        expect(logError).not.toHaveBeenCalled()
    })

    it('forwards the form schemes, submitted security values, headers and query to the security check', async () => {
        const honeypot: InboundFormSecurity = {
            inboundFormSecurityId: 51,
            inboundFormId: 1,
            type: InboundFormSecurityType.HONEYPOT,
            location: InboundFormSecurityLocation.BODY,
            key: 'website',
            config: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
        mockForm({ ...formFull, allowedHostnames: ['kunde.at'], inboundFormSecurity: [honeypot] })

        await service.submitForm(
            'contact',
            { security: { website: '' }, data: submission.data },
            { 'x-captcha': 'token' },
            { ref: 'landing' },
            '203.0.113.7',
        )

        expect(checkSubmission).toHaveBeenCalledWith([honeypot], {
            security: { website: '' },
            headers: { 'x-captcha': 'token' },
            query: { ref: 'landing' },
            allowedHostnames: ['kunde.at'],
            ip: '203.0.113.7',
        })
    })

    it('defaults missing security values to an empty object', async () => {
        mockForm(formFull)

        await service.submitForm('contact', { data: submission.data }, {}, {}, '')

        expect(checkSubmission).toHaveBeenCalledWith([], {
            security: {},
            headers: {},
            query: {},
            allowedHostnames: [],
            ip: '',
        })
    })

    it('stores nothing and sends nothing when the security check rejects', async () => {
        mockForm(formFull)
        checkSubmission.mockRejectedValue(new ForbiddenException('Captcha verification failed'))

        await expect(service.submitForm('contact', submission, {}, {}, '')).rejects.toThrow(ForbiddenException)

        expect(submissionCreate).not.toHaveBeenCalled()
        expect(transaction).not.toHaveBeenCalled()
        expect(enqueue).not.toHaveBeenCalled()
    })

    it('rejects a missing data payload when the form has required fields', async () => {
        mockForm(formFull)

        await expect(service.submitForm('contact', { security: {} }, {}, {}, '')).rejects.toThrow(BadRequestException)
        expect(submissionCreate).not.toHaveBeenCalled()
    })

    it('persists only the declared fields of an accepted submission', async () => {
        mockForm({ ...formFull, inboundFormReceivers: [] })

        await service.submitForm(
            'contact',
            { data: { email: 'max@example.com', firstName: 'Max', isAdmin: true, script: '<script>' } },
            {},
            {},
            '',
        )

        expect(submissionCreate).toHaveBeenCalledWith(
            {
                inboundFormId: 1,
                data: { email: 'max@example.com', firstName: 'Max' },
                status: InboundFormSubmissionStatus.ACCEPTED,
            },
            expect.objectContaining({ returning: true }),
        )
    })

    it('creates the submission and its deliveries inside one transaction', async () => {
        mockForm(formFull)
        const transactionHandle = { id: 'tx' }
        transaction.mockImplementation(async (callback: (t: unknown) => PromiseLike<unknown>) =>
            callback(transactionHandle),
        )

        await service.submitForm('contact', submission, {}, {}, '')

        expect(submissionCreate).toHaveBeenCalledWith(expect.anything(), {
            returning: true,
            transaction: transactionHandle,
        })
        expect(deliveryCreate).toHaveBeenCalledTimes(2)
        for (const [, options] of deliveryCreate.mock.calls) {
            expect(options).toEqual({ returning: true, transaction: transactionHandle })
        }
        expect(deliveryCreate).toHaveBeenCalledWith(
            expect.objectContaining({ inboundFormSubmissionId: 91, inboundFormTemplateId: 41 }),
            expect.anything(),
        )
    })

    it('enqueues nothing when persisting the submission fails', async () => {
        mockForm(formFull)
        transaction.mockRejectedValue(new Error('deadlock detected'))

        await expect(service.submitForm('contact', submission, {}, {}, '')).rejects.toThrow('deadlock detected')
        expect(enqueue).not.toHaveBeenCalled()
    })

    describe('timed token', () => {
        const timedTokenConfig: InboundFormTimedTokenConfig = { minDelaySeconds: 3, maxAgeSeconds: 3600 }
        const timedToken: InboundFormSecurity = {
            inboundFormSecurityId: 52,
            inboundFormId: 1,
            type: InboundFormSecurityType.TIMED_TOKEN,
            location: InboundFormSecurityLocation.BODY,
            key: 'formToken',
            config: timedTokenConfig,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
        const verified: VerifiedFormToken = { nonce: 'nonce-1', maxAgeSeconds: 3600 }
        const protectedForm: InboundFormFull = {
            ...formFull,
            allowedHostnames: ['kunde.at'],
            inboundFormSecurity: [timedToken],
        }
        const kundeOrigin = { origin: 'https://kunde.at' }

        it('consumes the token after field validation', async () => {
            mockForm(protectedForm)
            checkSubmission.mockResolvedValue({ result: SecurityCheckResult.PASSED, token: verified })

            await expect(
                service.submitForm('contact', { data: { email: 'broken' } }, kundeOrigin, {}, '203.0.113.7'),
            ).rejects.toThrow(BadRequestException)
            expect(consume).not.toHaveBeenCalled()

            await service.submitForm('contact', submission, kundeOrigin, {}, '203.0.113.7')

            expect(consume).toHaveBeenCalledExactlyOnceWith(verified)
            expect(consume.mock.invocationCallOrder[0]).toBeLessThan(submissionCreate.mock.invocationCallOrder[0]!)
        })

        it('keeps a token usable after a captcha failure', async () => {
            mockForm(protectedForm)
            checkSubmission.mockRejectedValue(new ForbiddenException('Captcha verification failed'))

            await expect(service.submitForm('contact', submission, kundeOrigin, {}, '203.0.113.7')).rejects.toThrow(
                new ForbiddenException('Captcha verification failed'),
            )
            expect(consume).not.toHaveBeenCalled()
        })

        it('stores nothing when the token was already used', async () => {
            mockForm(protectedForm)
            checkSubmission.mockResolvedValue({ result: SecurityCheckResult.PASSED, token: verified })
            consume.mockRejectedValue(new ForbiddenException('Form token already used'))

            await expect(service.submitForm('contact', submission, kundeOrigin, {}, '203.0.113.7')).rejects.toThrow(
                new ForbiddenException('Form token already used'),
            )
            expect(transaction).not.toHaveBeenCalled()
            expect(submissionCreate).not.toHaveBeenCalled()
            expect(enqueue).not.toHaveBeenCalled()
        })

        it('consumes nothing for a form without a timed token', async () => {
            mockForm(formFull)

            await service.submitForm('contact', submission, {}, {}, '')

            expect(consume).not.toHaveBeenCalled()
            expect(submissionCreate).toHaveBeenCalledOnce()
        })

        describe('issueToken', () => {
            const issued: IssuedFormToken = {
                token: 'payload.signature',
                notBefore: new Date('2026-10-20T10:00:03.000Z'),
                expiresAt: new Date('2026-10-20T11:00:00.000Z'),
                waitMs: 3000,
            }

            it('issues a token bound to the form and ip', async () => {
                mockForm(protectedForm)
                issue.mockReturnValue(issued)

                await expect(service.issueToken('contact', kundeOrigin, '203.0.113.7')).resolves.toEqual(issued)
                expect(issue).toHaveBeenCalledWith(1, '203.0.113.7', timedTokenConfig)
                expect(formFindOne).toHaveBeenCalledWith({
                    where: { slug: 'contact', isActive: true },
                    include: [InboundFormSecurityModel, { model: ProjectModel, required: true }],
                })
            })

            it('rejects an unknown or inactive slug', async () => {
                mockForm(null)

                await expect(service.issueToken('nope', kundeOrigin, '203.0.113.7')).rejects.toThrow(
                    new NotFoundException('Unknown form'),
                )
                expect(issue).not.toHaveBeenCalled()
            })

            it('rejects a form without a timed token scheme', async () => {
                mockForm({ ...protectedForm, inboundFormSecurity: [] })

                await expect(service.issueToken('contact', kundeOrigin, '203.0.113.7')).rejects.toThrow(
                    new NotFoundException('Unknown form'),
                )
                expect(issue).not.toHaveBeenCalled()
            })

            it('rejects a foreign origin', async () => {
                mockForm(protectedForm)

                await expect(
                    service.issueToken('contact', { origin: 'https://evil.at' }, '203.0.113.7'),
                ).rejects.toThrow(new ForbiddenException('Origin not allowed'))
                expect(issue).not.toHaveBeenCalled()
            })

            it('rejects issuance when no hostnames are listed', async () => {
                mockForm({ ...protectedForm, allowedHostnames: [] })

                await expect(service.issueToken('contact', kundeOrigin, '203.0.113.7')).rejects.toThrow(
                    new ForbiddenException('Origin not allowed'),
                )
                expect(issue).not.toHaveBeenCalled()
            })
        })
    })
})
