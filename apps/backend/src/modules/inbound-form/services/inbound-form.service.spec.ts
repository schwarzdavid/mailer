import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import { Op, UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { FORM_LIST_ORDER, InboundFormService } from './inbound-form.service.js'
import { FIELD_ORDER, INCLUDED_FIELD_ORDER } from '../helpers/field-order.js'
import { InboundFormModel } from '../models/inbound-form.model.js'
import { InboundFormFieldModel } from '../models/inbound-form-field.model.js'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model.js'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { Domain } from '../../domain/interfaces/domain.interface.js'
import { ProjectService } from '../../project/services/project.service.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { AbilityFactory } from '../../permission/services/ability-factory.service.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { User } from '../../user/interfaces/user.interface.js'
import { SecretEncryptionService } from '../../encryption/services/secret-encryption.service.js'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface.js'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldUpsert,
} from '../interfaces/inbound-form-field.interface.js'
import { InboundFormReceiver, InboundFormReceiverUpsert } from '../interfaces/inbound-form-receiver.interface.js'
import {
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
    InboundFormSecurityUpsert,
} from '../interfaces/inbound-form-security.interface.js'

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
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const textField: InboundFormField = {
    ...emailField,
    inboundFormFieldId: 22,
    key: 'firstName',
    label: 'First name',
    type: InboundFormFieldType.TEXT,
    position: 1,
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

const principal: User = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const manageAll = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const readOnlyAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [5] } } },
])
const formEditorAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [5] } } },
    { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [5] } } },
])
const projectUpdaterAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [5] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [5] } } },
])

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
    let assertProjectExists: Mock<ProjectService['assertProjectExists']>
    let assertDomainInProject: Mock<ProjectService['assertDomainInProject']>
    let getProjectIdsFor: Mock<AbilityFactory['getProjectIdsFor']>
    let transaction: Mock<(callback: (t: unknown) => PromiseLike<unknown>) => Promise<unknown>>
    let encrypt: Mock<SecretEncryptionService['encrypt']>

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
        assertProjectExists = vi.fn<typeof assertProjectExists>().mockResolvedValue(undefined)
        assertDomainInProject = vi.fn<typeof assertDomainInProject>().mockResolvedValue(undefined)
        getProjectIdsFor = vi.fn<typeof getProjectIdsFor>().mockResolvedValue('all')
        encrypt = vi.fn<SecretEncryptionService['encrypt']>((plaintext) => Promise.resolve(`encrypted(${plaintext})`))
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
                { provide: ProjectService, useValue: { assertProjectExists, assertDomainInProject } },
                { provide: AbilityFactory, useValue: { getProjectIdsFor } },
                { provide: SecretEncryptionService, useValue: { encrypt } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(InboundFormService)
    })

    describe('createForm', () => {
        it('verifies the domain and creates the form', async () => {
            const row = formRow()
            formCreate.mockResolvedValue(row)

            const result = await service.createForm(
                { name: 'Contact', slug: 'contact', domainId: 3, projectId: 5 },
                manageAll,
            )

            expect(getDomainById).toHaveBeenCalledWith(3)
            expect(formCreate).toHaveBeenCalledWith(
                { name: 'Contact', slug: 'contact', domainId: 3, projectId: 5, isActive: true },
                { returning: true },
            )
            expect(result.slug).toBe('contact')
        })

        it('creates a form without a domain', async () => {
            formCreate.mockResolvedValue(formRow({ domainId: null }))

            await service.createForm({ name: 'Contact', slug: 'contact', domainId: null, projectId: 5 }, manageAll)

            expect(getDomainById).not.toHaveBeenCalled()
        })

        it('lets form editors create forms and keeps project updaters out', async () => {
            const request = { name: 'Contact', slug: 'contact', domainId: null, projectId: 5 }
            formCreate.mockResolvedValue(formRow({ domainId: null }))

            await expect(service.createForm(request, formEditorAbility)).resolves.toBeDefined()
            await expect(service.createForm(request, projectUpdaterAbility)).rejects.toThrow(ForbiddenException)
        })

        it('rejects an unknown domain with a BadRequestException', async () => {
            getDomainById.mockRejectedValue(new Error('empty result'))

            await expect(
                service.createForm({ name: 'X', slug: 'x', domainId: 99, projectId: 5 }, manageAll),
            ).rejects.toThrow(BadRequestException)
        })
    })

    describe('createForm project rules', () => {
        it('rejects unknown projects', async () => {
            assertProjectExists.mockRejectedValue(new NotFoundException('Unknown project'))

            await expect(
                service.createForm({ name: 'Contact', slug: 'contact', domainId: null, projectId: 5 }, manageAll),
            ).rejects.toThrow(new BadRequestException('Unknown project'))
            expect(formCreate).not.toHaveBeenCalled()
        })

        it('rejects domains that are not assigned to the project', async () => {
            assertDomainInProject.mockRejectedValue(new BadRequestException('Domain does not belong to the project'))

            await expect(
                service.createForm({ name: 'Contact', slug: 'contact', domainId: 3, projectId: 5 }, manageAll),
            ).rejects.toThrow(new BadRequestException('Domain does not belong to the project'))
            expect(assertDomainInProject).toHaveBeenCalledWith(5, 3)
            expect(formCreate).not.toHaveBeenCalled()
        })
    })

    describe('getForms', () => {
        const listQuery = (where: unknown) => ({
            where,
            include: [InboundFormReceiverModel, { model: ProjectModel, attributes: [], required: true }],
            order: FORM_LIST_ORDER,
        })

        it('returns every form with its receivers as plain object', async () => {
            formFindAll.mockResolvedValue([formRow() as unknown as InboundFormModel])

            const result = await service.getForms(principal, manageAll)

            expect(formFindAll).toHaveBeenCalledOnce()
            expect(result).toEqual([formFull])
            expect(result[0]?.inboundFormReceivers).toEqual([receiver])
        })

        it('filters by project when a projectId is given', async () => {
            await service.getForms(principal, manageAll, 5)

            expect(getProjectIdsFor).not.toHaveBeenCalled()
            expect(formFindAll).toHaveBeenCalledWith(listQuery({ projectId: 5 }))
        })

        it('hides an unreadable project behind a 404 before querying', async () => {
            await expect(service.getForms(principal, readOnlyAbility, 6)).rejects.toThrow(NotFoundException)

            expect(formFindAll).not.toHaveBeenCalled()
        })

        it('returns all forms without a project filter for all-projects access', async () => {
            getProjectIdsFor.mockResolvedValue('all')

            await service.getForms(principal, manageAll)

            expect(getProjectIdsFor).toHaveBeenCalledWith(principal, 'read')
            expect(formFindAll).toHaveBeenCalledWith(listQuery(undefined))
        })

        it('scopes to the readable project ids otherwise', async () => {
            getProjectIdsFor.mockResolvedValue([1, 4])

            await service.getForms(principal, manageAll)

            expect(formFindAll).toHaveBeenCalledWith(listQuery({ projectId: { [Op.in]: [1, 4] } }))
        })

        it('returns nothing without readable projects', async () => {
            getProjectIdsFor.mockResolvedValue([])

            await expect(service.getForms(principal, readOnlyAbility)).resolves.toEqual([])
            expect(formFindAll).toHaveBeenCalledWith(listQuery({ projectId: { [Op.in]: [] } }))
        })
    })

    describe('getFormById', () => {
        it('returns the full form as plain object', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            const result = await service.getFormById(1, manageAll)

            expect(result.inboundFormFields).toHaveLength(2)
        })

        it('throws NotFoundException for an unknown id', async () => {
            formFindByPk.mockResolvedValue(null)

            await expect(service.getFormById(404, manageAll)).rejects.toThrow(NotFoundException)
        })

        it('hides forms of unreadable projects behind a 404', async () => {
            const readAbility = createMongoAbility<AppAbility>([
                { action: 'read', subject: 'Project', conditions: { projectId: { $in: [99] } } },
            ])
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.getFormById(1, readAbility)).rejects.toThrow(NotFoundException)
        })
    })

    describe('updateForm', () => {
        it('re-validates receiver senders when the domain changes', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            getDomainById.mockResolvedValue({ ...domain, domainId: 4, fqdn: 'other.example.com' })

            await expect(service.updateForm(1, { domainId: 4 }, manageAll)).rejects.toThrow(BadRequestException)
        })

        it('rejects removing the domain while receivers exist', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.updateForm(1, { domainId: null }, manageAll)).rejects.toThrow(BadRequestException)
        })

        it('applies a simple rename', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.updateForm(1, { name: 'New name' }, manageAll)

            expect(row.update).toHaveBeenCalledWith({ name: 'New name' })
        })

        it('drops keys the request left undefined', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.updateForm(
                1,
                { name: 'New name', slug: undefined, domainId: undefined, isActive: undefined },
                manageAll,
            )

            expect(row.update).toHaveBeenCalledWith({ name: 'New name' })
        })

        it('never moves the form into another project', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)
            const request = { isActive: false, projectId: 99, inboundFormId: 77 }

            await service.updateForm(1, request, manageAll)

            expect(row.update).toHaveBeenCalledWith({ isActive: false })
        })
    })

    describe('updateForm project rules', () => {
        it('rejects domain changes to domains outside the form project', async () => {
            formFindByPk.mockResolvedValue(formRow({ inboundFormReceivers: [] }) as unknown as InboundFormModel)
            assertDomainInProject.mockRejectedValue(new BadRequestException('Domain does not belong to the project'))

            await expect(service.updateForm(1, { domainId: 4 }, manageAll)).rejects.toThrow(
                new BadRequestException('Domain does not belong to the project'),
            )
            expect(assertDomainInProject).toHaveBeenCalledWith(5, 4)
        })
    })

    describe('deleteForm', () => {
        it('destroys the form', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.deleteForm(1, manageAll)

            expect(row.destroy).toHaveBeenCalled()
        })

        it('requires forms.manage to delete a form', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.deleteForm(1, formEditorAbility)).resolves.toBeUndefined()
            await expect(service.deleteForm(1, projectUpdaterAbility)).rejects.toThrow(ForbiddenException)
        })

        it('rejects mutations with read-only project access', async () => {
            const readAbility = createMongoAbility<AppAbility>([
                { action: 'read', subject: 'Project', conditions: { projectId: { $in: [5] } } },
            ])
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(service.deleteForm(1, readAbility)).rejects.toThrow(ForbiddenException)
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
                service.replaceFields(1, [upsert({ key: 'email' }), upsert({ key: 'email' })], manageAll),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects removing a field that a receiver placeholder references', async () => {
            const referencing = { ...receiver, emailReceiver: '{{email}}' }
            formFindByPk.mockResolvedValue(
                formRow({ inboundFormReceivers: [referencing] }) as unknown as InboundFormModel,
            )

            await expect(
                service.replaceFields(1, [upsert({ key: 'firstName', type: InboundFormFieldType.TEXT })], manageAll),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects re-typing a referenced field away from EMAIL', async () => {
            const referencing = { ...receiver, emailReplyTo: '{{email}}' }
            formFindByPk.mockResolvedValue(
                formRow({ inboundFormReceivers: [referencing] }) as unknown as InboundFormModel,
            )

            await expect(
                service.replaceFields(1, [upsert({ key: 'email', type: InboundFormFieldType.TEXT })], manageAll),
            ).rejects.toThrow(BadRequestException)
        })

        it('deletes removed fields, updates existing ones, creates new ones', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            fieldFindAll.mockResolvedValue([])

            await service.replaceFields(
                1,
                [
                    upsert({ key: 'email' }),
                    upsert({ key: 'message', type: InboundFormFieldType.TEXT, label: 'Message' }),
                ],
                manageAll,
            )

            expect(fieldDestroy).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { inboundFormId: 1, key: { [Op.notIn]: ['email', 'message'] } },
                }),
            )
            expect(fieldUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ label: 'Email', type: InboundFormFieldType.EMAIL, position: 0 }),
                expect.objectContaining({ where: { inboundFormId: 1, key: 'email' } }),
            )
            expect(fieldUpsertCreate).toHaveBeenCalledWith(
                expect.objectContaining({ inboundFormId: 1, key: 'message', position: 1 }),
                expect.anything(),
            )
        })

        it('stores each field at its index in the submitted order and reads them back in that order', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await service.replaceFields(
                1,
                [
                    upsert({ key: 'message', type: InboundFormFieldType.TEXT, label: 'Message' }),
                    upsert({ key: 'firstName', type: InboundFormFieldType.TEXT, label: 'First name' }),
                    upsert({ key: 'email' }),
                ],
                manageAll,
            )

            expect(fieldUpsertCreate).toHaveBeenCalledWith(
                expect.objectContaining({ key: 'message', position: 0 }),
                expect.anything(),
            )
            expect(fieldUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ position: 1 }),
                expect.objectContaining({ where: { inboundFormId: 1, key: 'firstName' } }),
            )
            expect(fieldUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ position: 2 }),
                expect.objectContaining({ where: { inboundFormId: 1, key: 'email' } }),
            )
            expect(fieldFindAll).toHaveBeenCalledWith({ where: { inboundFormId: 1 }, order: FIELD_ORDER })
        })

        it('loads forms with their fields ordered by position', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await service.getFormById(1, manageAll)

            expect(formFindByPk).toHaveBeenCalledWith(1, expect.objectContaining({ order: INCLUDED_FIELD_ORDER }))
        })

        it('rejects a field with a pattern that does not compile', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.replaceFields(1, [upsert({ validation: { pattern: '[' } })], manageAll),
            ).rejects.toThrow(
                new BadRequestException(
                    'Invalid pattern for field "email": the pattern is not a valid regular expression',
                ),
            )
        })

        it.each(['(a+)+$', '^(\\w+\\s?)*$', '(a|aa)*', '(x\\d{1,3})+', '(.)\\1', 'a'.repeat(201)])(
            'rejects the backtracking-prone pattern %s before anything is written',
            async (pattern) => {
                formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

                await expect(
                    service.replaceFields(
                        1,
                        [upsert({ type: InboundFormFieldType.TEXT, validation: { pattern } })],
                        manageAll,
                    ),
                ).rejects.toThrow(BadRequestException)
                expect(transaction).not.toHaveBeenCalled()
            },
        )

        it('accepts a safe pattern', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.replaceFields(
                    1,
                    [upsert({ type: InboundFormFieldType.TEXT, validation: { pattern: '^\\+?[0-9 ]{6,20}$' } })],
                    manageAll,
                ),
            ).resolves.toEqual([])
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

            await expect(service.replaceSecurity(1, [scheme({}), scheme({ key: 'other' })], manageAll)).rejects.toThrow(
                BadRequestException,
            )
        })

        it('rejects the csrf type', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.replaceSecurity(1, [scheme({ type: InboundFormSecurityType.CSRF })], manageAll),
            ).rejects.toThrow(BadRequestException)
        })

        const storedRecaptcha: InboundFormSecurity = {
            inboundFormSecurityId: 41,
            inboundFormId: 1,
            type: InboundFormSecurityType.RECAPTCHA,
            location: InboundFormSecurityLocation.BODY,
            key: 'recaptcha-token',
            config: { encryptedSecret: 'v1.stored-ciphertext', minScore: 0.3 },
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        it.each([
            ['without a config', null],
            ['with a config lacking the secret', { minScore: 0.5 }],
        ])('rejects a new recaptcha scheme %s', async (_case, config) => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.replaceSecurity(1, [scheme({ type: InboundFormSecurityType.RECAPTCHA, config })], manageAll),
            ).rejects.toThrow(new BadRequestException('Recaptcha requires a secret'))
            expect(securityBulkCreate).not.toHaveBeenCalled()
        })

        it('replaces all schemes in a transaction and stores only the encrypted secret', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await service.replaceSecurity(
                1,
                [
                    scheme({}),
                    scheme({
                        type: InboundFormSecurityType.RECAPTCHA,
                        key: 'recaptcha-token',
                        config: { secret: 's3cret', minScore: 0.5 },
                    }),
                ],
                manageAll,
            )

            expect(encrypt).toHaveBeenCalledWith('s3cret')
            expect(securityDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { inboundFormId: 1 } }))
            expect(securityBulkCreate).toHaveBeenCalledWith(
                [
                    {
                        inboundFormId: 1,
                        type: InboundFormSecurityType.HONEYPOT,
                        location: InboundFormSecurityLocation.BODY,
                        key: 'website',
                        config: null,
                    },
                    {
                        inboundFormId: 1,
                        type: InboundFormSecurityType.RECAPTCHA,
                        location: InboundFormSecurityLocation.BODY,
                        key: 'recaptcha-token',
                        config: { encryptedSecret: 'encrypted(s3cret)', minScore: 0.5 },
                    },
                ],
                expect.anything(),
            )
        })

        it('keeps the stored secret when an existing recaptcha scheme is resent without one', async () => {
            formFindByPk.mockResolvedValue(
                formRow({ inboundFormSecurity: [storedRecaptcha] }) as unknown as InboundFormModel,
            )

            await service.replaceSecurity(
                1,
                [
                    scheme({
                        type: InboundFormSecurityType.RECAPTCHA,
                        location: InboundFormSecurityLocation.HEADER,
                        key: 'X-Captcha',
                        config: { minScore: 0.7 },
                    }),
                ],
                manageAll,
            )

            expect(encrypt).not.toHaveBeenCalled()
            expect(securityBulkCreate).toHaveBeenCalledWith(
                [
                    expect.objectContaining({
                        location: InboundFormSecurityLocation.HEADER,
                        key: 'X-Captcha',
                        config: { encryptedSecret: 'v1.stored-ciphertext', minScore: 0.7 },
                    }),
                ],
                expect.anything(),
            )
        })

        it('keeps the stored secret and drops the minimum score when the config is omitted', async () => {
            formFindByPk.mockResolvedValue(
                formRow({ inboundFormSecurity: [storedRecaptcha] }) as unknown as InboundFormModel,
            )

            await service.replaceSecurity(1, [scheme({ type: InboundFormSecurityType.RECAPTCHA })], manageAll)

            expect(securityBulkCreate).toHaveBeenCalledWith(
                [expect.objectContaining({ config: { encryptedSecret: 'v1.stored-ciphertext' } })],
                expect.anything(),
            )
        })

        it('replaces the stored secret when a new one is sent', async () => {
            formFindByPk.mockResolvedValue(
                formRow({ inboundFormSecurity: [storedRecaptcha] }) as unknown as InboundFormModel,
            )

            await service.replaceSecurity(
                1,
                [scheme({ type: InboundFormSecurityType.RECAPTCHA, config: { secret: 'rotated' } })],
                manageAll,
            )

            expect(securityBulkCreate).toHaveBeenCalledWith(
                [expect.objectContaining({ config: { encryptedSecret: 'encrypted(rotated)' } })],
                expect.anything(),
            )
        })

        it('does not attach config to non-recaptcha schemes', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await service.replaceSecurity(1, [scheme({ config: { secret: 'stray' } })], manageAll)

            expect(encrypt).not.toHaveBeenCalled()
            expect(securityBulkCreate).toHaveBeenCalledWith(
                [expect.objectContaining({ type: InboundFormSecurityType.HONEYPOT, config: null })],
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

            const result = await service.createReceiver(1, upsert({}), manageAll)

            expect(receiverCreate).toHaveBeenCalledWith(
                expect.objectContaining({ inboundFormId: 1, emailFrom: 'noreply@mail.example.com' }),
                { returning: true },
            )
            expect(result.emailReceiver).toBe('owner@business.com')
        })

        it('accepts a placeholder recipient referencing an email field', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            receiverCreate.mockResolvedValue({ get: () => receiver })

            await service.createReceiver(1, upsert({ emailReceiver: '{{email}}' }), manageAll)

            expect(receiverCreate).toHaveBeenCalled()
        })

        it('rejects a placeholder referencing a non-email field', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.createReceiver(1, upsert({ emailReceiver: '{{firstName}}' }), manageAll),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects a recipient that is neither placeholder nor email', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.createReceiver(1, upsert({ emailReceiver: 'not-an-address' }), manageAll),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects a malformed sender address', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.createReceiver(1, upsert({ emailFrom: '@mail.example.com' }), manageAll),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects a sender outside the form domain', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.createReceiver(1, upsert({ emailFrom: 'noreply@evil.example.com' }), manageAll),
            ).rejects.toThrow(BadRequestException)
        })

        it('rejects receivers on a form without a domain', async () => {
            formFindByPk.mockResolvedValue(formRow({ domainId: null }) as unknown as InboundFormModel)

            await expect(service.createReceiver(1, upsert({}), manageAll)).rejects.toThrow(BadRequestException)
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

            await service.updateReceiver(1, 31, { emailReplyTo: '{{email}}' }, manageAll)

            expect(update).toHaveBeenCalledWith({ emailReplyTo: '{{email}}' })
        })

        it('validates a partial update against the stored values', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            const update = vi.fn<(values: Partial<InboundFormReceiver>) => Promise<unknown>>().mockResolvedValue(null)
            receiverFindOne.mockResolvedValue({
                ...receiver,
                get: () => receiver,
                update,
            } as unknown as InboundFormReceiverModel)

            await service.updateReceiver(
                1,
                31,
                { isActive: false, emailFrom: undefined, emailReceiver: undefined, emailReplyTo: undefined },
                manageAll,
            )

            expect(update).toHaveBeenCalledWith({ isActive: false })
        })

        it('never moves the receiver to another form', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            const update = vi.fn<(values: Partial<InboundFormReceiver>) => Promise<unknown>>().mockResolvedValue(null)
            receiverFindOne.mockResolvedValue({
                ...receiver,
                get: () => receiver,
                update,
            } as unknown as InboundFormReceiverModel)
            const request = { isActive: true, inboundFormId: 99, inboundFormReceiverId: 1 }

            await service.updateReceiver(1, 31, request, manageAll)

            expect(update).toHaveBeenCalledWith({ isActive: true })
        })

        it('throws NotFoundException for a receiver of another form', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            receiverFindOne.mockResolvedValue(null)

            await expect(service.updateReceiver(1, 999, { isActive: false }, manageAll)).rejects.toThrow(
                NotFoundException,
            )
        })
    })

    describe('deleteReceiver', () => {
        it('destroys the receiver', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
            receiverFindOne.mockResolvedValue({ get: () => receiver, destroy } as unknown as InboundFormReceiverModel)

            await service.deleteReceiver(1, 31, manageAll)

            expect(destroy).toHaveBeenCalled()
        })
    })

    describe('project access on mutations', () => {
        beforeEach(() => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
        })

        it('rejects creating a form in a project the caller can only read', async () => {
            await expect(
                service.createForm({ name: 'Contact', slug: 'contact', domainId: null, projectId: 5 }, readOnlyAbility),
            ).rejects.toThrow(ForbiddenException)
            expect(formCreate).not.toHaveBeenCalled()
        })

        it('hides a project the caller cannot read when creating a form in it', async () => {
            await expect(
                service.createForm({ name: 'Contact', slug: 'contact', domainId: null, projectId: 6 }, readOnlyAbility),
            ).rejects.toThrow(new NotFoundException('Unknown project'))
            expect(formCreate).not.toHaveBeenCalled()
        })

        it('rejects updating a form with read-only access', async () => {
            await expect(service.updateForm(1, { name: 'Renamed' }, readOnlyAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('rejects replacing fields with read-only access', async () => {
            await expect(service.replaceFields(1, [], readOnlyAbility)).rejects.toThrow(ForbiddenException)
            expect(transaction).not.toHaveBeenCalled()
        })

        it('rejects replacing security schemes with read-only access', async () => {
            await expect(service.replaceSecurity(1, [], readOnlyAbility)).rejects.toThrow(ForbiddenException)
            expect(securityDestroy).not.toHaveBeenCalled()
        })

        it('rejects creating a receiver with read-only access', async () => {
            await expect(
                service.createReceiver(
                    1,
                    {
                        emailFrom: 'noreply@mail.example.com',
                        emailReceiver: 'attacker@evil.com',
                        emailReplyTo: null,
                        isActive: true,
                    },
                    readOnlyAbility,
                ),
            ).rejects.toThrow(ForbiddenException)
            expect(receiverCreate).not.toHaveBeenCalled()
        })

        it('rejects updating a receiver with read-only access before loading it', async () => {
            await expect(
                service.updateReceiver(1, 31, { emailReceiver: 'attacker@evil.com' }, readOnlyAbility),
            ).rejects.toThrow(ForbiddenException)
            expect(receiverFindOne).not.toHaveBeenCalled()
        })

        it('rejects deleting a receiver with read-only access', async () => {
            await expect(service.deleteReceiver(1, 31, readOnlyAbility)).rejects.toThrow(ForbiddenException)
            expect(receiverFindOne).not.toHaveBeenCalled()
        })

        it('lets read-only members read a receiver but not load it for editing', async () => {
            receiverFindOne.mockResolvedValue({ get: () => receiver } as unknown as InboundFormReceiverModel)

            await expect(service.getReceiver(1, 31, readOnlyAbility)).resolves.toEqual(receiver)
            await expect(service.getReceiver(1, 31, readOnlyAbility, 'forms.manage')).rejects.toThrow(
                ForbiddenException,
            )
        })
    })

    describe('slug conflicts', () => {
        it('maps a duplicate slug on create to a bad request', async () => {
            formCreate.mockRejectedValue(new UniqueConstraintError({}))

            await expect(
                service.createForm({ name: 'Contact', slug: 'contact', domainId: null, projectId: 5 }, manageAll),
            ).rejects.toThrow(new BadRequestException('Slug is already in use'))
        })

        it('maps a duplicate slug on update to a bad request', async () => {
            const row = formRow()
            row.update.mockRejectedValue(new UniqueConstraintError({}))
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await expect(service.updateForm(1, { slug: 'taken' }, manageAll)).rejects.toThrow(
                new BadRequestException('Slug is already in use'),
            )
        })

        it('rethrows unexpected persistence errors on create', async () => {
            formCreate.mockRejectedValue(new Error('connection lost'))

            await expect(
                service.createForm({ name: 'Contact', slug: 'contact', domainId: null, projectId: 5 }, manageAll),
            ).rejects.toThrow('connection lost')
        })
    })

    describe('updateForm domain changes', () => {
        it('skips domain checks when the domain stays the same', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.updateForm(1, { domainId: 3, isActive: false }, manageAll)

            expect(getDomainById).not.toHaveBeenCalled()
            expect(row.update).toHaveBeenCalledWith({ domainId: 3, isActive: false })
        })

        it('allows removing the domain from a form without receivers', async () => {
            const row = formRow({ inboundFormReceivers: [] })
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)

            await service.updateForm(1, { domainId: null }, manageAll)

            expect(row.update).toHaveBeenCalledWith({ domainId: null })
        })

        it('switches to a domain every existing sender already uses', async () => {
            const row = formRow({ inboundFormReceivers: [{ ...receiver, emailFrom: 'noreply@other.example.com' }] })
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)
            getDomainById.mockResolvedValue({ ...domain, domainId: 4, fqdn: 'other.example.com' })

            await service.updateForm(1, { domainId: 4 }, manageAll)

            expect(row.update).toHaveBeenCalledWith({ domainId: 4 })
        })

        it('leaves the form untouched when a sender no longer matches the new domain', async () => {
            const row = formRow()
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)
            getDomainById.mockResolvedValue({ ...domain, domainId: 4, fqdn: 'other.example.com' })

            await expect(service.updateForm(1, { domainId: 4 }, manageAll)).rejects.toThrow(
                new BadRequestException('Sender address must use the form domain other.example.com'),
            )
            expect(row.update).not.toHaveBeenCalled()
        })

        it('rejects switching to an unknown domain', async () => {
            const row = formRow({ inboundFormReceivers: [] })
            formFindByPk.mockResolvedValue(row as unknown as InboundFormModel)
            getDomainById.mockRejectedValue(new NotFoundException())

            await expect(service.updateForm(1, { domainId: 99 }, manageAll)).rejects.toThrow(
                new BadRequestException('Unknown domain'),
            )
            expect(row.update).not.toHaveBeenCalled()
        })
    })

    describe('receiver address rules', () => {
        const upsert = (partial: Partial<InboundFormReceiverUpsert>): InboundFormReceiverUpsert => ({
            emailFrom: 'noreply@mail.example.com',
            emailReceiver: 'owner@business.com',
            emailReplyTo: null,
            isActive: true,
            ...partial,
        })

        beforeEach(() => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)
            receiverCreate.mockResolvedValue({ get: () => receiver })
        })

        it('accepts a sender on the form domain regardless of case', async () => {
            await service.createReceiver(1, upsert({ emailFrom: 'NoReply@MAIL.Example.com' }), manageAll)

            expect(receiverCreate).toHaveBeenCalled()
        })

        it.each(['noreply@evilmail.example.com', 'noreply@mail.example.com.evil.io', 'noreply@example.com'])(
            'rejects the lookalike sender %s',
            async (emailFrom) => {
                await expect(service.createReceiver(1, upsert({ emailFrom }), manageAll)).rejects.toThrow(
                    new BadRequestException('Sender address must use the form domain mail.example.com'),
                )
                expect(receiverCreate).not.toHaveBeenCalled()
            },
        )

        it('validates the reply-to like a recipient', async () => {
            await expect(
                service.createReceiver(1, upsert({ emailReplyTo: 'not-an-address' }), manageAll),
            ).rejects.toThrow(BadRequestException)
            await expect(
                service.createReceiver(1, upsert({ emailReplyTo: '{{firstName}}' }), manageAll),
            ).rejects.toThrow(BadRequestException)
            await expect(service.createReceiver(1, upsert({ emailReplyTo: '{{missing}}' }), manageAll)).rejects.toThrow(
                BadRequestException,
            )
            expect(receiverCreate).not.toHaveBeenCalled()
        })

        it('re-validates the merged receiver on a partial update', async () => {
            const update = vi.fn<(values: Partial<InboundFormReceiver>) => Promise<unknown>>()
            receiverFindOne.mockResolvedValue({
                ...receiver,
                get: () => receiver,
                update,
            } as unknown as InboundFormReceiverModel)

            await expect(
                service.updateReceiver(1, 31, { emailFrom: 'noreply@evil.example.org' }, manageAll),
            ).rejects.toThrow(BadRequestException)
            expect(update).not.toHaveBeenCalled()
        })

        it('looks receivers up within the requested form only', async () => {
            receiverFindOne.mockResolvedValue(null)

            await expect(service.deleteReceiver(1, 31, manageAll)).rejects.toThrow(
                new NotFoundException('Unknown receiver'),
            )
            expect(receiverFindOne).toHaveBeenCalledWith({ where: { inboundFormId: 1, inboundFormReceiverId: 31 } })
        })
    })

    describe('replaceFields edge cases', () => {
        it('keeps a referenced email field when it is only relabelled', async () => {
            formFindByPk.mockResolvedValue(
                formRow({
                    inboundFormReceivers: [{ ...receiver, emailReceiver: '{{email}}' }],
                }) as unknown as InboundFormModel,
            )

            await service.replaceFields(
                1,
                [
                    {
                        key: 'email',
                        label: 'Your email',
                        type: InboundFormFieldType.EMAIL,
                        defaultValue: null,
                        validation: null,
                    },
                ],
                manageAll,
            )

            expect(fieldUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ label: 'Your email' }),
                expect.objectContaining({ where: { inboundFormId: 1, key: 'email' } }),
            )
        })

        it('writes nothing when validation fails', async () => {
            formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

            await expect(
                service.replaceFields(
                    1,
                    [
                        {
                            key: 'email',
                            label: 'Email',
                            type: InboundFormFieldType.EMAIL,
                            defaultValue: null,
                            validation: { pattern: '(' },
                        },
                    ],
                    manageAll,
                ),
            ).rejects.toThrow(BadRequestException)
            expect(transaction).not.toHaveBeenCalled()
            expect(fieldDestroy).not.toHaveBeenCalled()
        })
    })

    it('clears every security scheme for an empty list', async () => {
        formFindByPk.mockResolvedValue(formRow() as unknown as InboundFormModel)

        await expect(service.replaceSecurity(1, [], manageAll)).resolves.toEqual([])

        expect(securityDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { inboundFormId: 1 } }))
        expect(securityBulkCreate).toHaveBeenCalledWith([], expect.objectContaining({ returning: true }))
    })
})
