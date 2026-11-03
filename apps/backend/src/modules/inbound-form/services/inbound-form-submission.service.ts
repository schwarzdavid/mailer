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
import { InboundFormDeliveryQueueService } from './inbound-form-delivery-queue.service.js'
import { EnqueueTimeoutError } from '../exceptions/enqueue-timeout.error.js'
import { InboundFormSubmissionStatus } from '../interfaces/inbound-form-submission.interface.js'
import { InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface.js'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface.js'
import { InboundFormTemplate } from '../interfaces/inbound-form-template.interface.js'
import { buildDataSchema } from '../helpers/field-schema.js'
import { describeError } from '../../../helpers/describe-error.js'
import { INCLUDED_FIELD_ORDER } from '../helpers/field-order.js'
import { isOriginAllowed } from '../helpers/origin.js'
import { isTimedTokenConfig } from '../helpers/security-config.js'
import { InboundFormSecurityType } from '../interfaces/inbound-form-security.interface.js'
import { IssuedFormToken } from '../interfaces/inbound-form-token.interface.js'

export interface PublicSubmission {
    security?: Record<string, unknown>
    data?: Record<string, unknown>
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
        private readonly sequelize: Sequelize,
        private readonly tokenService: InboundFormTokenService,
        private readonly deliveryQueueService: InboundFormDeliveryQueueService,
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

        const deliveryIds = await this.sequelize.transaction(async (transaction) => {
            const createdSubmission = await this.submissionModel.create(
                { inboundFormId: form.inboundFormId, data, status: InboundFormSubmissionStatus.ACCEPTED },
                { returning: true, transaction },
            )

            const createdDeliveryIds: number[] = []
            for (const { receiver, template } of sendPlan) {
                const delivery = await this.deliveryModel.create(
                    {
                        inboundFormSubmissionId: createdSubmission.inboundFormSubmissionId,
                        inboundFormReceiverId: receiver.inboundFormReceiverId,
                        inboundFormTemplateId: template.inboundFormTemplateId,
                        emailFrom: receiver.emailFrom,
                        emailTo: receiver.emailReceiver,
                        status: InboundFormDeliveryStatus.PENDING,
                        attempts: 0,
                        error: null,
                        sentAt: null,
                        mailMessageId: null,
                    },
                    { returning: true, transaction },
                )
                createdDeliveryIds.push(delivery.inboundFormDeliveryId)
            }

            return createdDeliveryIds
        })

        await this.enqueueDeliveries(deliveryIds)
    }

    private async enqueueDeliveries(deliveryIds: number[]): Promise<void> {
        for (const [index, deliveryId] of deliveryIds.entries()) {
            try {
                await this.deliveryQueueService.enqueue(deliveryId)
            } catch (error) {
                if (error instanceof EnqueueTimeoutError) {
                    const leftIds = deliveryIds.slice(index)
                    this.logger.warn(
                        `Enqueuing timed out, left ${leftIds.length} deliveries to the recovery sweep: ${leftIds.join(', ')}`,
                    )
                    return
                }
                this.logger.error(`Enqueuing delivery ${deliveryId} failed: ${describeError(error)}`)
            }
        }
    }
}
