import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { UniqueConstraintError } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormTemplateService } from './inbound-form-template.service'
import { InboundFormTemplateModel } from '../models/inbound-form-template.model'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface'
import { TemplateRendererService } from '../../mail/services/template-renderer.service'

type TemplateRow = InboundFormTemplate & {
    get: (options: { plain: true }) => InboundFormTemplate
    update: Mock<(values: Partial<InboundFormTemplate>) => Promise<TemplateRow>>
}

function templateRow(partial: Partial<InboundFormTemplate>): TemplateRow {
    const template: InboundFormTemplate = {
        inboundFormTemplateId: 1,
        inboundFormReceiverId: 5,
        subject: 'Hello {{firstName}}',
        template: '<p>Hi {{firstName}}</p>',
        status: InboundFormTemplateStatus.DRAFT,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
    }
    const row = {
        ...template,
        get: () => template,
        update: vi.fn<TemplateRow['update']>(),
    }
    row.update.mockResolvedValue(row)
    return row
}

describe('InboundFormTemplateService', () => {
    let service: InboundFormTemplateService
    let findOne: Mock<(typeof InboundFormTemplateModel)['findOne']>
    let findAll: Mock<(typeof InboundFormTemplateModel)['findAll']>
    let create: Mock<(typeof InboundFormTemplateModel)['create']>
    let max: Mock<(typeof InboundFormTemplateModel)['max']>

    beforeEach(async () => {
        findOne = vi.fn<typeof findOne>()
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        create = vi.fn<typeof create>()
        max = vi.fn<typeof max>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormTemplateService,
                TemplateRendererService,
                {
                    provide: getModelToken(InboundFormTemplateModel),
                    useValue: { findOne, findAll, create, max },
                },
            ],
        }).compile()

        service = module.get(InboundFormTemplateService)
    })

    describe('saveDraft', () => {
        it('updates the existing draft in place', async () => {
            const draft = templateRow({ status: InboundFormTemplateStatus.DRAFT, version: 3 })
            findOne.mockResolvedValue(draft as unknown as InboundFormTemplateModel)

            await service.saveDraft(5, { subject: 'New subject', template: '<p>New</p>' })

            expect(draft.update).toHaveBeenCalledWith({ subject: 'New subject', template: '<p>New</p>' })
            expect(create).not.toHaveBeenCalled()
        })

        it('creates a new draft at maxVersion + 1 when none exists', async () => {
            findOne.mockResolvedValue(null)
            max.mockResolvedValue(4)
            const created = templateRow({ version: 5 })
            create.mockResolvedValue(created)

            await service.saveDraft(5, { subject: 'S', template: 'T' })

            expect(create).toHaveBeenCalledWith(
                {
                    inboundFormReceiverId: 5,
                    subject: 'S',
                    template: 'T',
                    status: InboundFormTemplateStatus.DRAFT,
                    version: 5,
                },
                { returning: true },
            )
        })

        it('starts at version 1 for a receiver without templates', async () => {
            findOne.mockResolvedValue(null)
            max.mockResolvedValue(null)
            const created = templateRow({ version: 1 })
            create.mockResolvedValue(created)

            await service.saveDraft(5, { subject: 'S', template: 'T' })

            expect(create).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }), { returning: true })
        })

        it('updates the draft created concurrently when the unique constraint trips', async () => {
            const concurrent = templateRow({ status: InboundFormTemplateStatus.DRAFT, version: 5 })
            findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(concurrent as unknown as InboundFormTemplateModel)
            max.mockResolvedValue(4)
            create.mockRejectedValue(new UniqueConstraintError({}))

            const result = await service.saveDraft(5, { subject: 'Race', template: '<p>Race</p>' })

            expect(concurrent.update).toHaveBeenCalledWith({ subject: 'Race', template: '<p>Race</p>' })
            expect(result).toEqual(concurrent.get({ plain: true }))
        })

        it('rethrows the unique constraint error when no draft appears on retry', async () => {
            findOne.mockResolvedValue(null)
            max.mockResolvedValue(4)
            create.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.saveDraft(5, { subject: 'S', template: 'T' })).rejects.toThrow(UniqueConstraintError)
        })
    })

    describe('listVersions', () => {
        it('returns plain rows ordered by version descending', async () => {
            const rows = [templateRow({ version: 2 }), templateRow({ version: 1 })]
            findAll.mockResolvedValue(rows as unknown as InboundFormTemplateModel[])

            const result = await service.listVersions(5)

            expect(findAll).toHaveBeenCalledWith({
                where: { inboundFormReceiverId: 5 },
                order: [['version', 'DESC']],
            })
            expect(result).toEqual(rows.map((row) => row.get({ plain: true })))
        })
    })

    describe('publishDraft', () => {
        it('publishes a valid draft', async () => {
            const draft = templateRow({ status: InboundFormTemplateStatus.DRAFT })
            findOne.mockResolvedValue(draft as unknown as InboundFormTemplateModel)

            await service.publishDraft(5)

            expect(draft.update).toHaveBeenCalledWith({ status: InboundFormTemplateStatus.PUBLISHED })
        })

        it('throws NotFoundException without a draft', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.publishDraft(5)).rejects.toThrow(NotFoundException)
        })

        it('rejects publishing with an empty subject', async () => {
            const draft = templateRow({ subject: '   ' })
            findOne.mockResolvedValue(draft as unknown as InboundFormTemplateModel)

            await expect(service.publishDraft(5)).rejects.toThrow(BadRequestException)
        })

        it('rejects publishing a syntactically broken template', async () => {
            const draft = templateRow({ template: '{{#if}}' })
            findOne.mockResolvedValue(draft as unknown as InboundFormTemplateModel)

            await expect(service.publishDraft(5)).rejects.toThrow(BadRequestException)
        })
    })

    describe('getPublished', () => {
        it('returns the newest published version', async () => {
            const published = templateRow({ status: InboundFormTemplateStatus.PUBLISHED, version: 2 })
            findOne.mockResolvedValue(published as unknown as InboundFormTemplateModel)

            const result = await service.getPublished(5)

            expect(findOne).toHaveBeenCalledWith({
                where: { inboundFormReceiverId: 5, status: InboundFormTemplateStatus.PUBLISHED },
                order: [['version', 'DESC']],
            })
            expect(result?.version).toBe(2)
        })

        it('returns null when nothing is published', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.getPublished(5)).resolves.toBeNull()
        })
    })

    describe('getVersionSummaries', () => {
        it('maps draft and published versions per receiver', async () => {
            findAll.mockResolvedValue([
                templateRow({ inboundFormReceiverId: 5, status: InboundFormTemplateStatus.DRAFT, version: 3 }),
                templateRow({ inboundFormReceiverId: 5, status: InboundFormTemplateStatus.PUBLISHED, version: 2 }),
                templateRow({ inboundFormReceiverId: 6, status: InboundFormTemplateStatus.PUBLISHED, version: 1 }),
            ] as unknown as InboundFormTemplateModel[])

            const result = await service.getVersionSummaries([5, 6, 7])

            expect(result[5]).toEqual({ draftVersion: 3, publishedVersion: 2 })
            expect(result[6]).toEqual({ draftVersion: null, publishedVersion: 1 })
            expect(result[7]).toEqual({ draftVersion: null, publishedVersion: null })
        })

        it('returns an empty record without querying when no receivers are given', async () => {
            const result = await service.getVersionSummaries([])

            expect(result).toEqual({})
            expect(findAll).not.toHaveBeenCalled()
        })
    })
})
