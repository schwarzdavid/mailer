import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import { Op } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormService } from './inbound-form.service'
import { InboundFormModel } from '../models/inbound-form.model'
import { InboundFormFieldModel } from '../models/inbound-form-field.model'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model'
import { DomainService } from '../../domain/services/domain.service'
import { Domain } from '../../domain/interfaces/domain.interface'
import { ProjectService } from '../../project/services/project.service'
import { ProjectWithDomains } from '../../project/interfaces/project.interface'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldUpsert,
} from '../interfaces/inbound-form-field.interface'
import { InboundFormReceiver, InboundFormReceiverUpsert } from '../interfaces/inbound-form-receiver.interface'
import {
    InboundFormSecurityLocation,
    InboundFormSecurityType,
    InboundFormSecurityUpsert,
} from '../interfaces/inbound-form-security.interface'

const domain: Domain = {
    domainId: 3,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    activeDkimId: 7,
    dnsRecords: [],
    lastCheckedAt: null,
}

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

const textField: InboundFormField = {
    ...emailField,
    inboundFormFieldId: 22,
    key: 'firstName',
    label: 'First name',
    type: InboundFormFieldType.TEXT,
}

const receiver: InboundFormReceiver = {
    inboundFormReceiverId: 31,
    inboundFormId: 1,
    emailFrom: 'noreply@mail.example.com',
    emailReceiver: 'owner@business.com',
    emailReplyTo: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const form: InboundForm = {
    inboundFormId: 1,
    projectId: 5,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const formFull: InboundFormFull = {
    ...form,
    inboundFormFields: [emailField, textField],
    inboundFormReceivers: [receiver],
    inboundFormSecurity: [],
}

const projectWithDomains: ProjectWithDomains = {
    projectId: 5,
    name: 'Acme',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    domains: [domain],
}

type FormRow = InboundFormFull & {
    get: (options: { plain: true }) => InboundFormFull
    update: Mock<(values: Partial<InboundForm>) => Promise<FormRow>>
    destroy: Mock<() => Promise<void>>
}

function formRow(partial: Partial<InboundFormFull> = {}): FormRow {
    const plain: InboundFormFull = { ...formFull, ...partial }
    const row = {
        ...plain,
        get: () => plain,
        update: vi.fn<FormRow['update']>(),
        destroy: vi.fn<FormRow['destroy']>().mockResolvedValue(undefined),
    }
    row.update.mockResolvedValue(row)
    return row
}

describe('InboundFormService', () => {
    let service: InboundFormService
    let formFindAll: Mock<(typeof InboundFormModel)['findAll']>
    let formFindByPk: Mock<(typeof InboundFormModel)['findByPk']>
    let formCreate: Mock<(typeof InboundFormModel)['create']>
    let fieldFindAll: Mock<(typeof InboundFormFieldModel)['findAll']>
    let fieldDestroy: Mock<(typeof InboundFormFieldModel)['destroy']>
    let fieldUpsertCreate: Mock<(typeof InboundFormFieldModel)['create']>
    let fieldUpdate: Mock<(typeof InboundFormFieldModel)['update']>
    let securityDestroy: Mock<(typeof InboundFormSecurityModel)['destroy']>
    let securityBulkCreate: Mock<(typeof InboundFormSecurityModel)['bulkCreate']>
    let receiverFindOne: Mock<(typeof InboundFormReceiverModel)['findOne']>
    let receiverCreate: Mock<(typeof InboundFormReceiverModel)['create']>
    let getDomainById: Mock<DomainService['getDomainById']>
    let getProjectById: Mock<ProjectService['getProjectById']>
    let assertDomainInProject: Mock<ProjectService['assertDomainInProject']>
    let transaction: Mock<(callback: (t: unknown) => PromiseLike<unknown>) => Promise<unknown>>

    beforeEach(async () => {
        formFindAll = vi.fn<typeof formFindAll>().mockResolvedValue([])
        formFindByPk = vi.fn<typeof formFindByPk>()
        formCreate = vi.fn<typeof formCreate>()
        fieldFindAll = vi.fn<typeof fieldFindAll>().mockResolvedValue([])
        fieldDestroy = vi.fn<typeof fieldDestroy>().mockResolvedValue(0)
        fieldUpsertCreate = vi.fn<typeof fieldUpsertCreate>()
        fieldUpdate = vi.fn<typeof fieldUpdate>().mockResolvedValue([0])
        securityDestroy = vi.fn<typeof securityDestroy>().mockResolvedValue(0)
        securityBulkCreate = vi.fn<typeof securityBulkCreate>().mockResolvedValue([])
        receiverFindOne = vi.fn<typeof receiverFindOne>()
        receiverCreate = vi.fn<typeof receiverCreate>()
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(domain)
        getProjectById = vi.fn<typeof getProjectById>().mockResolvedValue(projectWithDomains)
        assertDomainInProject = vi.fn<typeof assertDomainInProject>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation(async (callback: (t: unknown) => PromiseLike<unknown>) => callback(null))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormService,
                {
                    provide: getModelToken(InboundFormModel),
                    useValue: { findAll: formFindAll, findByPk: formFindByPk, create: formCreate },
                },
                {
                    provide: getModelToken(InboundFormFieldModel),
                    useValue: {
                        findAll: fieldFindAll,
                        destroy: fieldDestroy,
                        create: fieldUpsertCreate,
                        update: fieldUpdate,
                    },
                },
                {
                    provide: getModelToken(InboundFormSecurityModel),
                    useValue: { destroy: securityDestroy, bulkCreate: securityBulkCreate },
                },
                {
                    provide: getModelToken(InboundFormReceiverModel),
                    useValue: { findOne: receiverFindOne, create: receiverCreate },
                },
                { provide: DomainService, useValue: { getDomainById } },
                { provide: ProjectService, useValue: { getProjectById, assertDomainInProject } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(InboundFormService)
    })

    describe('createForm', () => {
        it('verifies the domain and creates the form', async () => {
            const row = formRow()
            formCreate.mockResolvedValue(row)

            const result = await service.createForm({ name: 'Contact', slug: 'contact', domainId: 3, projectId: 5 })

            expect(getDomainById).toHaveBeenCalledWith(3)
            expect(formCreate).toHaveBeenCalledWith(
                { name: 'Contact', slug: 'contact', domainId: 3, projectId: 5, isActive: true },
                { returning: true },
            )
            expect(result.slug).toBe('contact')
        })

        it('creates a form without a domain', async () => {
            formCreate.mockResolvedValue(formRow({ domainId: null }))

            await service.createForm({ name: 'Contact', slug: 'contact', domainId: null, projectId: 5 })

            expect(getDomainById).not.toHaveBeenCalled()
        })

        it('rejects an unknown domain with a BadRequestException', async () => {
            getDomainById.mockRejectedValue(new Error('empty result'))

            await expect(service.createForm({ name: 'X', slug: 'x', domainId: 99, projectId: 5 })).rejects.toThrow(
                BadRequestException,
            )
        })
    })

    describe('createForm project rules', () => {
        it('rejects unknown projects', async () => {
            getProjectById.mockRejectedValue(new NotFoundException('Unknown project'))

            await expect(
                service.createForm({ name: 'Contact', slug: 'contact', domainId: null, projectId: 5 }),
            ).rejects.toThrow(new BadRequestException('Unknown project'))
            expect(formCreate).not.toHaveBeenCalled()
        })

        it('rejects domains that are not assigned to the project', async () => {
            assertDomainInProject.mockRejectedValue(new BadRequestException('Domain does not belong to the project'))

            await expect(
                service.createForm({ name: 'Contact', slug: 'contact', domainId: 3, projectId: 5 }),
            ).rejects.toThrow(new BadRequestException('Domain does not belong to the project'))
            expect(assertDomainInProject).toHaveBeenCalledWith(5, 3)
            expect(formCreate).not.toHaveBeenCalled()
        })
    })

    describe('getForms', () => {
        it('returns every form as plain object', async () => {
            formFindAll.mockResolvedValue([formRow() as unknown as InboundFormModel])

            const result = await service.getForms()

            expect(formFindAll).toHaveBeenCalledOnce()
            expect(result).toEqual([formFull])
        })

        it('filters by project when a projectId is given', async () => {
            await service.getForms(5)

            expect(formFindAll).toHaveBeenCalledWith({ where: { projectId: 5 } })
        })

        it('returns all forms without a filter', async () => {
            await service.getForms()

            expect(formFindAll).toHaveBeenCalledWith(undefined)
        })
    })

    describe('getFormById', () => {
        it('returns the full form as plain object', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            const result = await service.getFormById(1)

            expect(result.inboundFormFields).toHaveLength(2)
        })

        it('throws NotFoundException for an unknown id', async () => {
            formFindByPk.mockResolvedValue(null)

            await expect(service.getFormById(404)).rejects.toThrow(NotFoundException)
        })
    })

    describe('updateForm', () => {
        it('re-validates receiver senders when the domain changes', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            getDomainById.mockResolvedValue({ ...domain, domainId: 4, fqdn: 'other.example.com' })

            await expect(service.updateForm(1, { domainId: 4 })).rejects.toThrow(BadRequestException)
        })

        it('rejects removing the domain while receivers exist', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.updateForm(1, { domainId: null })).rejects.toThrow(BadRequestException)
        })

        it('applies a simple rename', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.updateForm(1, { name: 'New name' })

            expect(row.update).toHaveBeenCalledWith({ name: 'New name' })
        })
    })

    describe('updateForm project rules', () => {
        it('rejects domain changes to domains outside the form project', async () => {
            formFindByPk.mockResolvedValue(formRow({ inboundFormReceivers: [] }) as unknown as InboundFormModel)
            assertDomainInProject.mockRejectedValue(new BadRequestException('Domain does not belong to the project'))

            await expect(service.updateForm(1, { domainId: 4 })).rejects.toThrow(
                new BadRequestException('Domain does not belong to the project'),
            )
            expect(assertDomainInProject).toHaveBeenCalledWith(5, 4)
        })
    })

    describe('deleteForm', () => {
        it('destroys the form', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.deleteForm(1)

            expect(row.destroy).toHaveBeenCalled()
        })
    })

    describe('replaceFields', () => {
        const upsert = (partial: Partial<InboundFormFieldUpsert>): InboundFormFieldUpsert => ({
            key: 'email',
            label: 'Email',
            type: InboundFormFieldType.EMAIL,
            defaultValue: null,
            validation: null,
            ...partial,
        })

        it('rejects duplicate keys in the payload', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.replaceFields(1, [upsert({ key: 'email' }), upsert({ key: 'email' })]),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects removing a field that a receiver placeholder references', async () => {
            const referencing = { ...receiver, emailReceiver: '{{email}}' }
            formFindByPk.mockResolvedValue(
                formRow({ inboundFormReceivers: [referencing] }) as unknown as InboundFormModel,
            )

            await expect(
                service.replaceFields(1, [upsert({ key: 'firstName', type: InboundFormFieldType.TEXT })]),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects re-typing a referenced field away from EMAIL', async () => {
            const referencing = { ...receiver, emailReplyTo: '{{email}}' }
            formFindByPk.mockResolvedValue(
                formRow({ inboundFormReceivers: [referencing] }) as unknown as InboundFormModel,
            )

            await expect(
                service.replaceFields(1, [upsert({ key: 'email', type: InboundFormFieldType.TEXT })]),
            ).rejects.toThrow(BadRequestException)
        })

        it('deletes removed fields, updates existing ones, creates new ones', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            fieldFindAll.mockResolvedValue([])

            await service.replaceFields(1, [
                upsert({ key: 'email' }),
                upsert({ key: 'message', type: InboundFormFieldType.TEXT, label: 'Message' }),
            ])

            expect(fieldDestroy).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { inboundFormId: 1, key: { [Op.notIn]: ['email', 'message'] } },
                }),
            )
            expect(fieldUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ label: 'Email', type: InboundFormFieldType.EMAIL }),
                expect.objectContaining({ where: { inboundFormId: 1, key: 'email' } }),
            )
            expect(fieldUpsertCreate).toHaveBeenCalledWith(
                expect.objectContaining({ inboundFormId: 1, key: 'message' }),
                expect.anything(),
            )
        })

        it('rejects a field with a pattern that does not compile', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.replaceFields(1, [upsert({ validation: { pattern: '[' } })])).rejects.toThrow(
                new BadRequestException('Invalid pattern for field "email"'),
            )
        })
    })

    describe('replaceSecurity', () => {
        const scheme = (partial: Partial<InboundFormSecurityUpsert>): InboundFormSecurityUpsert => ({
            type: InboundFormSecurityType.HONEYPOT,
            location: InboundFormSecurityLocation.BODY,
            key: 'website',
            config: null,
            ...partial,
        })

        it('rejects duplicate scheme types', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.replaceSecurity(1, [scheme({}), scheme({ key: 'other' })])).rejects.toThrow(
                BadRequestException,
            )
        })

        it('rejects the csrf type', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.replaceSecurity(1, [scheme({ type: InboundFormSecurityType.CSRF })])).rejects.toThrow(
                BadRequestException,
            )
        })

        it('rejects recaptcha without a secret', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.replaceSecurity(1, [scheme({ type: InboundFormSecurityType.RECAPTCHA, config: null })]),
            ).rejects.toThrow(BadRequestException)
        })

        it('replaces all schemes in a transaction', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await service.replaceSecurity(1, [
                scheme({}),
                scheme({
                    type: InboundFormSecurityType.RECAPTCHA,
                    key: 'recaptcha-token',
                    config: { secret: 's3cret', minScore: 0.5 },
                }),
            ])

            expect(securityDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { inboundFormId: 1 } }))
            expect(securityBulkCreate).toHaveBeenCalledWith(
                [
                    expect.objectContaining({ inboundFormId: 1, type: InboundFormSecurityType.HONEYPOT }),
                    expect.objectContaining({ inboundFormId: 1, type: InboundFormSecurityType.RECAPTCHA }),
                ],
                expect.anything(),
            )
        })
    })

    describe('createReceiver', () => {
        const upsert = (partial: Partial<InboundFormReceiverUpsert>): InboundFormReceiverUpsert => ({
            emailFrom: 'noreply@mail.example.com',
            emailReceiver: 'owner@business.com',
            emailReplyTo: null,
            isActive: true,
            ...partial,
        })

        it('creates a receiver with a literal recipient', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            receiverCreate.mockResolvedValue({
                get: () => receiver,
            })

            const result = await service.createReceiver(1, upsert({}))

            expect(receiverCreate).toHaveBeenCalledWith(
                expect.objectContaining({ inboundFormId: 1, emailFrom: 'noreply@mail.example.com' }),
                { returning: true },
            )
            expect(result.emailReceiver).toBe('owner@business.com')
        })

        it('accepts a placeholder recipient referencing an email field', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            receiverCreate.mockResolvedValue({ get: () => receiver })

            await service.createReceiver(1, upsert({ emailReceiver: '{{email}}' }))

            expect(receiverCreate).toHaveBeenCalled()
        })

        it('rejects a placeholder referencing a non-email field', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.createReceiver(1, upsert({ emailReceiver: '{{firstName}}' }))).rejects.toThrow(
                BadRequestException,
            )
        })

        it('rejects a recipient that is neither placeholder nor email', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.createReceiver(1, upsert({ emailReceiver: 'not-an-address' }))).rejects.toThrow(
                BadRequestException,
            )
        })

        it('rejects a malformed sender address', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.createReceiver(1, upsert({ emailFrom: '@mail.example.com' }))).rejects.toThrow(
                BadRequestException,
            )
        })

        it('rejects a sender outside the form domain', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.createReceiver(1, upsert({ emailFrom: 'noreply@evil.example.com' }))).rejects.toThrow(
                BadRequestException,
            )
        })

        it('rejects receivers on a form without a domain', async () => {
            formFindByPk.mockResolvedValue(formRow({ domainId: null }) as unknown as InboundFormModel)

            await expect(service.createReceiver(1, upsert({}))).rejects.toThrow(BadRequestException)
        })
    })

    describe('updateReceiver', () => {
        it('validates and applies the update', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            const update = vi.fn<(values: Partial<InboundFormReceiver>) => Promise<unknown>>().mockResolvedValue(null)
            receiverFindOne.mockResolvedValue({
                ...receiver,
                get: () => receiver,
                update,
            } as unknown as InboundFormReceiverModel)

            await service.updateReceiver(1, 31, { emailReplyTo: '{{email}}' })

            expect(update).toHaveBeenCalledWith({ emailReplyTo: '{{email}}' })
        })

        it('throws NotFoundException for a receiver of another form', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            receiverFindOne.mockResolvedValue(null)

            await expect(service.updateReceiver(1, 999, { isActive: false })).rejects.toThrow(NotFoundException)
        })
    })

    describe('deleteReceiver', () => {
        it('destroys the receiver', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
            receiverFindOne.mockResolvedValue({ get: () => receiver, destroy } as unknown as InboundFormReceiverModel)

            await service.deleteReceiver(1, 31)

            expect(destroy).toHaveBeenCalled()
        })
    })
})
