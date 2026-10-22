import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { InboundFormModel } from '../models/inbound-form.model.js'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model.js'
import { InboundFormTemplateModel } from '../models/inbound-form-template.model.js'
import { InboundFormSubmissionModel } from '../models/inbound-form-submission.model.js'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model.js'
import { TemplateRendererService } from '../../mail/services/template-renderer.service.js'
import { MailService, SendMail, SendMailContext, SentMail } from '../../mail/services/mail.service.js'
import { MailSendError } from '../../mail/exceptions/mail-send.error.js'
import { MailMessageSource } from '../../mail/interfaces/mail-message.interface.js'
import { InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface.js'
import { parsePlaceholder } from '../helpers/placeholder.js'
import { describeError } from '../../../helpers/describe-error.js'

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

interface PreparedMail {
    mail: SendMail
    context: SendMailContext
}

@Injectable()
export class InboundFormDeliveryService {
    private readonly logger = new Logger(InboundFormDeliveryService.name)

    constructor(
        @InjectModel(InboundFormDeliveryModel)
        private readonly deliveryModel: typeof InboundFormDeliveryModel,
        private readonly templateRendererService: TemplateRendererService,
        private readonly mailService: MailService,
    ) {}

    async deliver(inboundFormDeliveryId: number, isLastAttempt: boolean): Promise<void> {
        const delivery = await this.deliveryModel.findByPk(inboundFormDeliveryId, {
            include: [
                { model: InboundFormSubmissionModel, include: [InboundFormModel] },
                InboundFormReceiverModel,
                InboundFormTemplateModel,
            ],
        })
        if (!delivery || delivery.status !== InboundFormDeliveryStatus.PENDING) {
            return
        }

        const attempts = delivery.attempts + 1
        let prepared: PreparedMail
        try {
            prepared = this.prepare(delivery)
        } catch (error) {
            await this.recordFailure(delivery, attempts, error, false)
            return
        }

        let sent: SentMail
        try {
            sent = await this.mailService.sendMail(prepared.mail, prepared.context)
        } catch (error) {
            const temporary = !(error instanceof MailSendError) || error.transient
            await this.recordFailure(delivery, attempts, error, temporary && !isLastAttempt)
            if (temporary) {
                throw error
            }
            return
        }

        await delivery.update({
            status: InboundFormDeliveryStatus.SENT,
            emailTo: prepared.mail.to,
            sentAt: new Date(),
            mailMessageId: sent.mailMessageId,
            attempts,
            error: null,
        })
    }

    private async recordFailure(
        delivery: InboundFormDeliveryModel,
        attempts: number,
        error: unknown,
        willRetry: boolean,
    ): Promise<void> {
        if (willRetry) {
            this.logger.warn(
                `Delivery ${delivery.inboundFormDeliveryId} attempt ${attempts} failed, retrying: ${describeError(error)}`,
            )
        } else {
            this.logger.error(
                `Delivery ${delivery.inboundFormDeliveryId} attempt ${attempts} failed: ${describeError(error)}`,
            )
        }
        await delivery.update({
            status: willRetry ? InboundFormDeliveryStatus.PENDING : InboundFormDeliveryStatus.FAILED,
            error: errorMessage(error),
            attempts,
            mailMessageId: error instanceof MailSendError ? error.mailMessageId : null,
        })
    }

    private prepare(delivery: InboundFormDeliveryModel): PreparedMail {
        const { submission, receiver, template } = delivery
        if (!submission?.inboundForm) {
            throw new Error('Submission was deleted')
        }
        if (!receiver) {
            throw new Error('Receiver was deleted')
        }
        if (!template) {
            throw new Error('Template was deleted')
        }

        const { data } = submission
        return {
            mail: {
                from: receiver.emailFrom,
                to: this.resolveAddress(receiver.emailReceiver, data),
                replyTo: receiver.emailReplyTo !== null ? this.resolveAddress(receiver.emailReplyTo, data) : undefined,
                subject: this.templateRendererService.renderSubject(template.subject, data),
                html: this.templateRendererService.render(template.template, data),
            },
            context: { projectId: submission.inboundForm.projectId, source: MailMessageSource.INBOUND_FORM },
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
