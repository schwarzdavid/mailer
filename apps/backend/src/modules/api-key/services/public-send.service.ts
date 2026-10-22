import { Injectable, Logger } from '@nestjs/common'
import { DomainService } from '../../domain/services/domain.service.js'
import { ProjectService } from '../../project/services/project.service.js'
import { MailService } from '../../mail/services/mail.service.js'
import { MailSendError } from '../../mail/exceptions/mail-send.error.js'
import { MailMessageSource } from '../../mail/interfaces/mail-message.interface.js'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception.js'
import { describeError } from '../../../helpers/describe-error.js'
import { ApiKey } from '../interfaces/api-key.interface.js'
import { PublicSendDto } from '../dtos/public-send.dto.js'
import { PublicSendErrorCode, PublicSendException } from '../exceptions/public-send.exception.js'

@Injectable()
export class PublicSendService {
    private readonly logger = new Logger(PublicSendService.name)

    constructor(
        private readonly domainService: DomainService,
        private readonly projectService: ProjectService,
        private readonly mailService: MailService,
    ) {}

    async send(apiKey: ApiKey, mail: PublicSendDto): Promise<{ mailMessageId: number }> {
        const separator = mail.from.lastIndexOf('@')
        const fqdn = mail.from.slice(separator + 1).toLowerCase()
        const from = `${mail.from.slice(0, separator)}@${fqdn}`

        await this.assertFromDomainUsable(apiKey.projectId, fqdn)

        try {
            const { mailMessageId } = await this.mailService.sendMail(
                {
                    from,
                    to: mail.to,
                    replyTo: mail.replyTo,
                    subject: mail.subject,
                    html: mail.html,
                    text: mail.text,
                },
                { projectId: apiKey.projectId, source: MailMessageSource.API, apiKeyId: apiKey.apiKeyId },
            )
            return { mailMessageId }
        } catch (error) {
            if (!(error instanceof MailSendError)) {
                throw error
            }
            if (error.cause instanceof EmailBlockedException) {
                throw new PublicSendException(
                    PublicSendErrorCode.RECIPIENT_BLOCKED,
                    'The recipient is blocked after previous bounces',
                    error.mailMessageId,
                )
            }
            this.logger.warn(`API key ${apiKey.prefix} delivery ${error.mailMessageId} failed: ${describeError(error)}`)
            throw new PublicSendException(
                PublicSendErrorCode.DELIVERY_FAILED,
                'The mail could not be delivered to the relay',
                error.mailMessageId,
            )
        }
    }

    private async assertFromDomainUsable(projectId: number, fqdn: string): Promise<void> {
        const domain = await this.domainService.getDomainByFqdn(fqdn)
        if (!domain || !(await this.projectService.hasDomain(projectId, domain.domainId))) {
            throw new PublicSendException(
                PublicSendErrorCode.FROM_DOMAIN_NOT_ALLOWED,
                'The from address must use a domain of this project',
            )
        }

        if (!(await this.domainService.getSendingDomainByFqdn(fqdn))) {
            throw new PublicSendException(
                PublicSendErrorCode.FROM_DOMAIN_NOT_READY,
                'The from domain has no active DKIM key',
            )
        }
    }
}
