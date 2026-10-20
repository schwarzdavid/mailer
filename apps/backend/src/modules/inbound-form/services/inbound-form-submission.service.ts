import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { InboundFormModel } from '../models/inbound-form.model.js'
import { InboundFormFieldModel } from '../models/inbound-form-field.model.js'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model.js'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model.js'
import { InboundFormSubmissionModel } from '../models/inbound-form-submission.model.js'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { InboundFormSecurityService, SecurityCheckResult } from './inbound-form-security.service.js'
import { InboundFormTemplateService } from './inbound-form-template.service.js'
import { InboundFormTokenService } from './inbound-form-token.service.js'
import { TemplateRendererService } from '../../mail/services/template-renderer.service.js'
import { MailService } from '../../mail/services/mail.service.js'
import { MailSendError } from '../../mail/exceptions/mail-send.error.js'
import { MailMessageSource } from '../../mail/interfaces/mail-message.interface.js'
import { InboundFormSubmissionStatus } from '../interfaces/inbound-form-submission.interface.js'
import { InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface.js'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface.js'
import { InboundFormTemplate } from '../interfaces/inbound-form-template.interface.js'
import { buildDataSchema } from '../helpers/field-schema.js'
import { parsePlaceholder } from '../helpers/placeholder.js'
import { INCLUDED_FIELD_ORDER } from '../helpers/field-order.js'
import { isOriginAllowed } from '../helpers/origin.js'
import { isTimedTokenConfig } from '../helpers/security-config.js'
import { InboundFormSecurityType } from '../interfaces/inbound-form-security.interface.js'
import { IssuedFormToken } from '../interfaces/inbound-form-token.interface.js'

export interface PublicSubmission {
    security?: Record<string, unknown>
    data?: Record<string, unknown>
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

interface PendingDelivery {
    delivery: InboundFormDeliveryModel
    receiver: InboundFormReceiver
    template: InboundFormTemplate
    projectId: number
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
        private readonly tokenService: InboundFormTokenService,
    ) {}

    async issueToken(slug: string, headers: Record<string, unknown>, ip: string): Promise<IssuedFormToken> {
        const form = await this.formModel.findOne({
            where: { slug, isActive: true },
            include: [InboundFormSecurityModel, { model: ProjectModel, required: true }],
        })
        const scheme = form?.inboundFormSecurity
            .map((row) => row.get({ plain: true }))
            .find((security) => security.type === InboundFormSecurityType.TIMED_TOKEN)

        if (!form || !scheme || !isTimedTokenConfig(scheme.config)) {
            throw new NotFoundException('Unknown form')
        }
        if (form.allowedHostnames.length === 0 || !isOriginAllowed(form.allowedHostnames, headers)) {
            throw new ForbiddenException('Origin not allowed')
        }

        return this.tokenService.issue(form.inboundFormId, ip, scheme.config)
    }

    async submitForm(
        slug: string,
        submission: PublicSubmission,
        headers: Record<string, unknown>,
        query: Record<string, unknown>,
        ip: string,
    ): Promise<void> {
        const form = await this.formModel.findOne({
            where: { slug, isActive: true },
            include: [
                InboundFormFieldModel,
                InboundFormSecurityModel,
                InboundFormReceiverModel,
                { model: ProjectModel, required: true },
            ],
            order: INCLUDED_FIELD_ORDER,
        })

        if (!form) {
            throw new NotFoundException('Unknown form')
        }

        const securityOutcome = await this.securityService.checkSubmission(
            form.inboundFormSecurity.map((scheme) => scheme.get({ plain: true })),
            {
                security: submission.security ?? {},
                headers,
                query,
                allowedHostnames: form.allowedHostnames,
                ip,
            },
        )

        if (securityOutcome.result === SecurityCheckResult.SPAM) {
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

        if (securityOutcome.token) {
            await this.tokenService.consume(securityOutcome.token)
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
                        mailMessageId: null,
                    },
                    { returning: true, transaction },
                )
                createdDeliveries.push({ delivery, receiver, template, projectId: form.projectId })
            }

            return { submissionRow: createdSubmission, pendingDeliveries: createdDeliveries }
        })

        void this.processDeliveries(pendingDeliveries, data).catch((error: unknown) => {
            this.logger.error(
                `Processing deliveries for submission ${submissionRow.inboundFormSubmissionId} failed: ${errorMessage(error)}`,
            )
        })
    }

    private async processDeliveries(deliveries: PendingDelivery[], data: Record<string, unknown>): Promise<void> {
        for (const pending of deliveries) {
            try {
                await this.processDelivery(pending, data)
            } catch (error) {
                this.logger.error(
                    `Recording the outcome of delivery ${pending.delivery.inboundFormDeliveryId} failed: ${errorMessage(error)}`,
                )
            }
        }
    }

    private async processDelivery(
        { delivery, receiver, template, projectId }: PendingDelivery,
        data: Record<string, unknown>,
    ): Promise<void> {
        try {
            const emailTo = this.resolveAddress(receiver.emailReceiver, data)
            const replyTo =
                receiver.emailReplyTo !== null ? this.resolveAddress(receiver.emailReplyTo, data) : undefined

            const { mailMessageId } = await this.mailService.sendMail(
                {
                    from: receiver.emailFrom,
                    to: emailTo,
                    replyTo,
                    subject: this.templateRendererService.renderSubject(template.subject, data),
                    html: this.templateRendererService.render(template.template, data),
                },
                { projectId, source: MailMessageSource.INBOUND_FORM },
            )

            await delivery.update({
                status: InboundFormDeliveryStatus.SENT,
                emailTo,
                sentAt: new Date(),
                mailMessageId,
            })
        } catch (error) {
            const message = errorMessage(error)
            this.logger.error(`Delivery ${delivery.inboundFormDeliveryId} failed: ${message}`)
            await delivery.update({
                status: InboundFormDeliveryStatus.FAILED,
                error: message,
                mailMessageId: error instanceof MailSendError ? error.mailMessageId : null,
            })
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
