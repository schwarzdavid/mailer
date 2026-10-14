import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, type WhereOptions } from 'sequelize'
import { assertProjectReadable } from '../../permission/helpers/project-access.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { MailMessageModel } from '../models/mail-message.model.js'
import {
    MailMessage,
    MailMessagePage,
    MailMessageQuery,
    MailMessageStatus,
} from '../interfaces/mail-message.interface.js'

export type MailMessagePending = Pick<
    MailMessage,
    'projectId' | 'source' | 'apiKeyId' | 'emailFrom' | 'emailTo' | 'subject'
>

@Injectable()
export class MailMessageService {
    constructor(@InjectModel(MailMessageModel) private readonly mailMessageModel: typeof MailMessageModel) {}

    async recordPending(values: MailMessagePending): Promise<MailMessage> {
        const row = await this.mailMessageModel.create({
            ...values,
            status: MailMessageStatus.PENDING,
            error: null,
            smtpMessageId: null,
            sentAt: null,
        })

        return row.get({ plain: true })
    }

    async markSent(mailMessageId: number, smtpMessageId: string): Promise<void> {
        await this.mailMessageModel.update(
            { status: MailMessageStatus.SENT, smtpMessageId, sentAt: new Date() },
            { where: { mailMessageId } },
        )
    }

    async markUnsent(
        mailMessageId: number,
        status: MailMessageStatus.FAILED | MailMessageStatus.BLOCKED,
        error: string,
    ): Promise<void> {
        await this.mailMessageModel.update({ status, error }, { where: { mailMessageId } })
    }

    async getProjectMessages(projectId: number, query: MailMessageQuery): Promise<MailMessagePage> {
        const { rows, count } = await this.mailMessageModel.findAndCountAll({
            where: this.buildFilter(projectId, query),
            order: [['mailMessageId', 'DESC']],
            limit: query.itemsPerPage,
            offset: (query.page - 1) * query.itemsPerPage,
        })

        return { items: rows.map((row) => row.get({ plain: true })), total: count }
    }

    async listForProject(projectId: number, query: MailMessageQuery, ability: AppAbility): Promise<MailMessagePage> {
        assertProjectReadable(ability, projectId)

        return this.getProjectMessages(projectId, query)
    }

    private buildFilter(projectId: number, query: MailMessageQuery): WhereOptions<MailMessage> {
        const conditions: WhereOptions<MailMessage>[] = [{ projectId }]

        const search = query.search?.trim()
        if (search) {
            const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
            conditions.push({
                [Op.or]: [{ emailTo: { [Op.iLike]: pattern } }, { subject: { [Op.iLike]: pattern } }],
            })
        }
        if (query.source) {
            conditions.push({ source: query.source })
        }
        if (query.status) {
            conditions.push({ status: query.status })
        }

        return { [Op.and]: conditions }
    }
}
