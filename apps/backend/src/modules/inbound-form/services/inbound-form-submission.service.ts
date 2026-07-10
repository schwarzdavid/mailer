import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
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
import { InboundFormSubmissionStatus } from '../interfaces/inbound-form-submission.interface'
import { InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface'
import { InboundFormTemplate } from '../interfaces/inbound-form-template.interface'
import { buildDataSchema } from '../helpers/field-schema'
import { parsePlaceholder } from '../helpers/placeholder'

export interface PublicSubmission {
    security?: Record<string, unknown>
    data?: Record<string, unknown>
}

interface PendingDelivery {
    delivery: InboundFormDeliveryModel
    receiver: InboundFormReceiver
    template: InboundFormTemplate
}

@Injectable()
export class InboundFormSubmissionService {
    private readonly logger = new Logger(InboundFormSubmissionService.name)

    constructor(
        @InjectModel(InboundFormModel) private readonly formModel: typeof InboundFormModel,
        @InjectModel(InboundFormSubmissionModel)
        private readonly submissionModel: typeof InboundFormSubmissionModel,
        @InjectModel(InboundFormDeliveryModel)
        private readonly deliveryModel: typeof InboundFormDeliveryModel,
        private readonly securityService: InboundFormSecurityService,
        private readonly templateService: InboundFormTemplateService,
        private readonly templateRendererService: TemplateRendererService,
        private readonly mailService: MailService,
        private readonly sequelize: Sequelize,
    ) {}

    async submitForm(
        slug: string,
        submission: PublicSubmission,
        headers: Record<string, unknown>,
        query: Record<string, unknown>,
    ): Promise<void> {
        const form = await this.formModel.findOne({
            where: { slug, isActive: true },
            include: [InboundFormFieldModel, InboundFormSecurityModel, InboundFormReceiverModel],
        })

        if (!form) {
            throw new NotFoundException('Unknown form')
        }

        const securityResult = await this.securityService.checkSubmission(
            form.inboundFormSecurity.map((scheme) => scheme.get({ plain: true })),
            { security: submission.security ?? {}, headers, query },
        )

        if (securityResult === SecurityCheckResult.SPAM) {
            await this.submissionModel.create(
                {
                    inboundFormId: form.inboundFormId,
                    data: submission.data ?? {},
                    status: InboundFormSubmissionStatus.SPAM,
                },
                { returning: true },
            )
            return
        }

        const fields = form.inboundFormFields.map((field) => field.get({ plain: true }))
        const parsed = buildDataSchema(fields).safeParse(submission.data ?? {})
        if (!parsed.success) {
            throw new BadRequestException(
                parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
            )
        }
        const data = parsed.data

        const sendPlan: { receiver: InboundFormReceiver; template: InboundFormTemplate }[] = []
        for (const receiverModel of form.inboundFormReceivers) {
            const receiver = receiverModel.get({ plain: true })
            if (!receiver.isActive) {
                continue
            }
            const template = await this.templateService.getPublished(receiver.inboundFormReceiverId)
            if (!template) {
                continue
            }
            sendPlan.push({ receiver, template })
        }

        const { submissionRow, pendingDeliveries } = await this.sequelize.transaction(async (transaction) => {
            const createdSubmission = await this.submissionModel.create(
                { inboundFormId: form.inboundFormId, data, status: InboundFormSubmissionStatus.ACCEPTED },
                { returning: true, transaction },
            )

            const createdDeliveries: PendingDelivery[] = []
            for (const { receiver, template } of sendPlan) {
                const delivery = await this.deliveryModel.create(
                    {
                        inboundFormSubmissionId: createdSubmission.inboundFormSubmissionId,
                        inboundFormReceiverId: receiver.inboundFormReceiverId,
                        inboundFormTemplateId: template.inboundFormTemplateId,
                        emailFrom: receiver.emailFrom,
                        emailTo: receiver.emailReceiver,
                        status: InboundFormDeliveryStatus.PENDING,
                        error: null,
                        sentAt: null,
                    },
                    { returning: true, transaction },
                )
                createdDeliveries.push({ delivery, receiver, template })
            }

            return { submissionRow: createdSubmission, pendingDeliveries: createdDeliveries }
        })

        void this.processDeliveries(pendingDeliveries, data).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error(
                `Processing deliveries for submission ${submissionRow.inboundFormSubmissionId} failed: ${message}`,
            )
        })
    }

    private async processDeliveries(deliveries: PendingDelivery[], data: Record<string, unknown>): Promise<void> {
        for (const { delivery, receiver, template } of deliveries) {
            try {
                const emailTo = this.resolveAddress(receiver.emailReceiver, data)
                const replyTo =
                    receiver.emailReplyTo !== null ? this.resolveAddress(receiver.emailReplyTo, data) : undefined

                await this.mailService.sendMail({
                    from: receiver.emailFrom,
                    to: emailTo,
                    replyTo,
                    subject: this.templateRendererService.render(template.subject, data),
                    html: this.templateRendererService.render(template.template, data),
                })

                await delivery.update({
                    status: InboundFormDeliveryStatus.SENT,
                    emailTo,
                    sentAt: new Date(),
                })
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                this.logger.error(`Delivery ${delivery.inboundFormDeliveryId} failed: ${message}`)
                await delivery.update({ status: InboundFormDeliveryStatus.FAILED, error: message })
            }
        }
    }

    private resolveAddress(value: string, data: Record<string, unknown>): string {
        const fieldKey = parsePlaceholder(value)
        if (fieldKey === null) {
            return value
        }

        const resolved = data[fieldKey]
        if (typeof resolved !== 'string' || resolved === '') {
            throw new Error(`Recipient field "${fieldKey}" is empty`)
        }

        return resolved
    }
}
