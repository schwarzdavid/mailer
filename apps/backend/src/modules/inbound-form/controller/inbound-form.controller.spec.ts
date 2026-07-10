import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormController } from './inbound-form.controller'
import { InboundFormService } from '../services/inbound-form.service'
import { InboundFormTemplateService } from '../services/inbound-form-template.service'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface'

const form: InboundForm = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
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

const formFull: InboundFormFull = {
    ...form,
    inboundFormFields: [],
    inboundFormSecurity: [],
    inboundFormReceivers: [receiver],
}

const template: InboundFormTemplate = {
    inboundFormTemplateId: 41,
    inboundFormReceiverId: 31,
    subject: 'Subject',
    template: '<p>Body</p>',
    status: InboundFormTemplateStatus.DRAFT,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('InboundFormController', () => {
    let controller: InboundFormController
    let createForm: Mock<InboundFormService['createForm']>
    let getForms: Mock<InboundFormService['getForms']>
    let getFormById: Mock<InboundFormService['getFormById']>
    let updateForm: Mock<InboundFormService['updateForm']>
    let deleteForm: Mock<InboundFormService['deleteForm']>
    let replaceFields: Mock<InboundFormService['replaceFields']>
    let replaceSecurity: Mock<InboundFormService['replaceSecurity']>
    let createReceiver: Mock<InboundFormService['createReceiver']>
    let updateReceiver: Mock<InboundFormService['updateReceiver']>
    let deleteReceiver: Mock<InboundFormService['deleteReceiver']>
    let getReceiver: Mock<InboundFormService['getReceiver']>
    let listVersions: Mock<InboundFormTemplateService['listVersions']>
    let saveDraft: Mock<InboundFormTemplateService['saveDraft']>
    let publishDraft: Mock<InboundFormTemplateService['publishDraft']>
    let getVersionSummaries: Mock<InboundFormTemplateService['getVersionSummaries']>

    beforeEach(async () => {
        createForm = vi.fn<typeof createForm>().mockResolvedValue(form)
        getForms = vi.fn<typeof getForms>().mockResolvedValue([form])
        getFormById = vi.fn<typeof getFormById>().mockResolvedValue(formFull)
        updateForm = vi.fn<typeof updateForm>().mockResolvedValue(formFull)
        deleteForm = vi.fn<typeof deleteForm>().mockResolvedValue(undefined)
        replaceFields = vi.fn<typeof replaceFields>().mockResolvedValue([])
        replaceSecurity = vi.fn<typeof replaceSecurity>().mockResolvedValue([])
        createReceiver = vi.fn<typeof createReceiver>().mockResolvedValue(receiver)
        updateReceiver = vi.fn<typeof updateReceiver>().mockResolvedValue(receiver)
        deleteReceiver = vi.fn<typeof deleteReceiver>().mockResolvedValue(undefined)
        getReceiver = vi.fn<typeof getReceiver>().mockResolvedValue(receiver)
        listVersions = vi.fn<typeof listVersions>().mockResolvedValue([template])
        saveDraft = vi.fn<typeof saveDraft>().mockResolvedValue(template)
        publishDraft = vi.fn<typeof publishDraft>().mockResolvedValue(template)
        getVersionSummaries = vi.fn<typeof getVersionSummaries>().mockResolvedValue({
            31: { draftVersion: 1, publishedVersion: null },
        })

        const module: TestingModule = await Test.createTestingModule({
            controllers: [InboundFormController],
            providers: [
                {
                    provide: InboundFormService,
                    useValue: {
                        createForm,
                        getForms,
                        getFormById,
                        updateForm,
                        deleteForm,
                        replaceFields,
                        replaceSecurity,
                        createReceiver,
                        updateReceiver,
                        deleteReceiver,
                        getReceiver,
                    },
                },
                {
                    provide: InboundFormTemplateService,
                    useValue: { listVersions, saveDraft, publishDraft, getVersionSummaries },
                },
            ],
        }).compile()

        controller = module.get(InboundFormController)
    })

    it('creates a form', async () => {
        const result = await controller.createInboundForm({ name: 'Contact', slug: 'contact', domainId: 3 })

        expect(createForm).toHaveBeenCalledWith({ name: 'Contact', slug: 'contact', domainId: 3 })
        expect(result.slug).toBe('contact')
    })

    it('lists forms', async () => {
        const result = await controller.getInboundForms()

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ inboundFormId: 1, slug: 'contact' })
    })

    it('returns the detail view with template summaries per receiver', async () => {
        const result = await controller.getInboundForm(1)

        expect(getVersionSummaries).toHaveBeenCalledWith([31])
        expect(result.receivers[0]).toMatchObject({
            inboundFormReceiverId: 31,
            draftVersion: 1,
            publishedVersion: null,
        })
    })

    it('replaces fields through the service', async () => {
        await controller.updateInboundFormFields(1, { fields: [] })

        expect(replaceFields).toHaveBeenCalledWith(1, [])
    })

    it('replaces security schemes through the service', async () => {
        await controller.updateInboundFormSecurity(1, { security: [] })

        expect(replaceSecurity).toHaveBeenCalledWith(1, [])
    })

    it('creates a receiver from the request body', async () => {
        const result = await controller.createInboundFormReceiver(1, {
            emailFrom: 'noreply@mail.example.com',
            emailReceiver: 'owner@business.com',
            emailReplyTo: null,
            isActive: true,
        })

        expect(createReceiver).toHaveBeenCalledWith(1, {
            emailFrom: 'noreply@mail.example.com',
            emailReceiver: 'owner@business.com',
            emailReplyTo: null,
            isActive: true,
        })
        expect(result).toMatchObject({ inboundFormReceiverId: 31, draftVersion: null, publishedVersion: null })
    })

    it('updates a receiver and merges its template summary', async () => {
        const result = await controller.updateInboundFormReceiver(1, 31, { isActive: false })

        expect(updateReceiver).toHaveBeenCalledWith(1, 31, { isActive: false })
        expect(getVersionSummaries).toHaveBeenCalledWith([31])
        expect(result).toMatchObject({ inboundFormReceiverId: 31, draftVersion: 1, publishedVersion: null })
    })

    it('deletes a receiver through the service', async () => {
        await controller.deleteInboundFormReceiver(1, 31)

        expect(deleteReceiver).toHaveBeenCalledWith(1, 31)
    })

    it('scopes template access to the form before saving a draft', async () => {
        await controller.saveInboundFormTemplateDraft(1, 31, { subject: 'S', template: 'T' })

        expect(getReceiver).toHaveBeenCalledWith(1, 31)
        expect(saveDraft).toHaveBeenCalledWith(31, { subject: 'S', template: 'T' })
    })

    it('publishes the draft of a receiver', async () => {
        await controller.publishInboundFormTemplate(1, 31)

        expect(getReceiver).toHaveBeenCalledWith(1, 31)
        expect(publishDraft).toHaveBeenCalledWith(31)
    })

    it('lists template versions', async () => {
        const result = await controller.getInboundFormTemplates(1, 31)

        expect(getReceiver).toHaveBeenCalledWith(1, 31)
        expect(result).toHaveLength(1)
    })
})
