import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { MAIL_TRANSPORTER } from '../mail.constants.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { SecretEncryptionService } from '../../encryption/services/secret-encryption.service.js'
import { EmailBlockService } from '../../bounce/services/email-block.service.js'
import { BounceService } from '../../bounce/services/bounce.service.js'
import { BounceType } from '../../bounce/interfaces/bounce.interface.js'
import { EmailBlockedException } from '../../bounce/exceptions/email-blocked.exception.js'
import { MailMessageService } from './mail-message.service.js'
import { MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'
import { MailSendError } from '../exceptions/mail-send.error.js'

export interface SendMail {
    from: string
    to: string
    replyTo?: string
    subject: string
    html: string
    text?: string
}

export interface SendMailContext {
    projectId: number | null
    source: MailMessageSource
    apiKeyId?: number
}

export interface SentMail {
    mailMessageId: number
    smtpMessageId: string
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

const DESTINATION_ADDRESS_STATUS_CODES: ReadonlySet<string> = new Set(['5.1.1', '5.1.2', '5.1.3', '5.1.6', '5.1.10'])
const ENHANCED_STATUS_CODE = /^\d{3}[ -](\d\.\d{1,3}\.\d{1,3})\b/

function permanentRecipientRejectionCode(error: unknown): number | undefined {
    if (!(error instanceof Error) || !('command' in error) || error.command !== 'RCPT TO') {
        return undefined
    }
    const responseCode = 'responseCode' in error ? error.responseCode : undefined
    if (typeof responseCode !== 'number' || responseCode < 500) {
        return undefined
    }
    const response = 'response' in error && typeof error.response === 'string' ? error.response : ''
    const enhancedCode = ENHANCED_STATUS_CODE.exec(response)?.[1]
    return enhancedCode !== undefined && DESTINATION_ADDRESS_STATUS_CODES.has(enhancedCode) ? responseCode : undefined
}

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name)

    constructor(
        @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>,
        private readonly domainService: DomainService,
        private readonly secretEncryptionService: SecretEncryptionService,
        private readonly emailBlockService: EmailBlockService,
        private readonly bounceService: BounceService,
        private readonly mailMessageService: MailMessageService,
    ) {}

    async sendMail(mail: SendMail, context: SendMailContext): Promise<SentMail> {
        const { mailMessageId } = await this.mailMessageService.recordPending({
            projectId: context.projectId,
            source: context.source,
            apiKeyId: context.apiKeyId ?? null,
            emailFrom: mail.from,
            emailTo: mail.to,
            subject: mail.subject,
        })

        let smtpMessageId: string
        try {
            smtpMessageId = await this.deliver(mail, mailMessageId)
        } catch (error) {
            const status = error instanceof EmailBlockedException ? MailMessageStatus.BLOCKED : MailMessageStatus.FAILED
            await this.updateLog(mailMessageId, () =>
                this.mailMessageService.markUnsent(mailMessageId, status, errorMessage(error)),
            )
            throw new MailSendError(mailMessageId, error)
        }

        await this.updateLog(mailMessageId, () => this.mailMessageService.markSent(mailMessageId, smtpMessageId))

        return { mailMessageId, smtpMessageId }
    }

    private async deliver(mail: SendMail, mailMessageId: number): Promise<string> {
        await this.emailBlockService.assertNotBlocked(mail.to)

        const [localPart, fqdn] = mail.from.split('@')
        if (!localPart || !fqdn) {
            throw new Error(`Invalid from address: ${mail.from}`)
        }

        const domain = await this.domainService.getSendingDomainByFqdn(fqdn)
        if (!domain) {
            throw new Error(`No sending domain configured for ${fqdn}`)
        }

        const privateKey = await this.secretEncryptionService.decrypt(domain.activeDkim.privateKey)
        const sendingDomain = await this.domainService.getConfiguredSendingDomain()

        let info: SMTPTransport.SentMessageInfo
        try {
            info = await this.transporter.sendMail({
                from: mail.from,
                to: mail.to,
                replyTo: mail.replyTo,
                subject: mail.subject,
                html: mail.html,
                text: mail.text,
                envelope: sendingDomain ? { from: `bounce@${sendingDomain.fqdn}`, to: mail.to } : undefined,
                dkim: {
                    domainName: domain.fqdn,
                    keySelector: domain.activeDkim.selector,
                    privateKey,
                },
            })
        } catch (error) {
            await this.recordRejection(mailMessageId, mail.to, error)
            throw error
        }

        this.logger.log(`Sent mail message ${mailMessageId}`)
        return info.messageId
    }

    private async updateLog(mailMessageId: number, update: () => Promise<void>): Promise<void> {
        try {
            await update()
        } catch (error) {
            this.logger.error(`Failed to update mail message ${mailMessageId}: ${errorMessage(error)}`)
        }
    }

    private async recordRejection(mailMessageId: number, emailAddress: string, error: unknown): Promise<void> {
        const responseCode = permanentRecipientRejectionCode(error)
        if (responseCode === undefined) {
            return
        }

        try {
            await this.bounceService.recordBounce({
                emailAddress,
                type: BounceType.PERMANENT,
                statusCode: String(responseCode),
                reason: errorMessage(error),
                messageId: null,
                receivedAt: new Date(),
            })
        } catch (recordError) {
            this.logger.error(
                `Failed to record rejection bounce for mail message ${mailMessageId}: ${errorMessage(recordError)}`,
            )
        }
    }
}
