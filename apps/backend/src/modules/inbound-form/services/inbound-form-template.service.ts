import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, UniqueConstraintError } from 'sequelize'
import { InboundFormTemplateModel } from '../models/inbound-form-template.model'
import {
    InboundFormTemplate,
    InboundFormTemplateDraft,
    InboundFormTemplateStatus,
    InboundFormTemplateSummary,
} from '../interfaces/inbound-form-template.interface'
import { TemplateRendererService, TemplateRenderError } from '../../mail/services/template-renderer.service'

@Injectable()
export class InboundFormTemplateService {
    constructor(
        @InjectModel(InboundFormTemplateModel) private readonly templateModel: typeof InboundFormTemplateModel,
        private readonly templateRendererService: TemplateRendererService,
    ) {}

    async listVersions(receiverId: number): Promise<InboundFormTemplate[]> {
        const templates = await this.templateModel.findAll({
            where: { inboundFormReceiverId: receiverId },
            order: [['version', 'DESC']],
        })

        return templates.map((template) => template.get({ plain: true }))
    }

    async saveDraft(receiverId: number, draft: InboundFormTemplateDraft): Promise<InboundFormTemplate> {
        const existingDraft = await this.findDraft(receiverId)

        if (existingDraft) {
            await existingDraft.update({ subject: draft.subject, template: draft.template })
            return existingDraft.get({ plain: true })
        }

        const latestVersion = await this.templateModel.max<number | null, InboundFormTemplateModel>('version', {
            where: { inboundFormReceiverId: receiverId },
        })

        try {
            const created = await this.templateModel.create(
                {
                    inboundFormReceiverId: receiverId,
                    subject: draft.subject,
                    template: draft.template,
                    status: InboundFormTemplateStatus.DRAFT,
                    version: (latestVersion ?? 0) + 1,
                },
                { returning: true },
            )

            return created.get({ plain: true })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                const concurrentDraft = await this.findDraft(receiverId)
                if (concurrentDraft) {
                    await concurrentDraft.update({ subject: draft.subject, template: draft.template })
                    return concurrentDraft.get({ plain: true })
                }
            }
            throw error
        }
    }

    async publishDraft(receiverId: number): Promise<InboundFormTemplate> {
        const draft = await this.findDraft(receiverId)

        if (!draft) {
            throw new NotFoundException('There is no draft to publish')
        }
        if (!draft.subject.trim() || !draft.template.trim()) {
            throw new BadRequestException('Subject and template must not be empty')
        }

        try {
            this.templateRendererService.assertValid(draft.subject)
            this.templateRendererService.assertValid(draft.template)
        } catch (error) {
            if (error instanceof TemplateRenderError) {
                throw new BadRequestException(error.message)
            }
            throw error
        }

        await draft.update({ status: InboundFormTemplateStatus.PUBLISHED })

        return draft.get({ plain: true })
    }

    async getPublished(receiverId: number): Promise<InboundFormTemplate | null> {
        const template = await this.templateModel.findOne({
            where: { inboundFormReceiverId: receiverId, status: InboundFormTemplateStatus.PUBLISHED },
            order: [['version', 'DESC']],
        })

        return template?.get({ plain: true }) ?? null
    }

    async getVersionSummaries(receiverIds: number[]): Promise<Record<number, InboundFormTemplateSummary>> {
        const summaries: Record<number, InboundFormTemplateSummary> = {}
        for (const receiverId of receiverIds) {
            summaries[receiverId] = { draftVersion: null, publishedVersion: null }
        }

        if (receiverIds.length === 0) {
            return summaries
        }

        const templates = await this.templateModel.findAll({
            where: { inboundFormReceiverId: { [Op.in]: receiverIds } },
            order: [['version', 'ASC']],
        })

        for (const template of templates) {
            const summary = summaries[template.inboundFormReceiverId]
            if (!summary) {
                continue
            }
            if (template.status === InboundFormTemplateStatus.DRAFT) {
                summary.draftVersion = template.version
            } else {
                summary.publishedVersion = template.version
            }
        }

        return summaries
    }

    private findDraft(receiverId: number): Promise<InboundFormTemplateModel | null> {
        return this.templateModel.findOne({
            where: { inboundFormReceiverId: receiverId, status: InboundFormTemplateStatus.DRAFT },
        })
    }
}
