import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Transporter } from 'nodemailer'
import { MAIL_TRANSPORTER } from '../mail.constants'
import { DomainService } from '../../domain/services/domain.service'
import { DkimEncryptionService } from '../../domain/services/dkim-encryption.service'
import { EmailBlockService } from '../../bounce/services/email-block.service'
import { BounceService } from '../../bounce/services/bounce.service'
import { BounceType } from '../../bounce/interfaces/bounce.interface'

export interface SendMail {
    from: string
    to: string
    replyTo?: string
    subject: string
    html: string
}

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name)

    constructor(
        @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
        private readonly domainService: DomainService,
        private readonly dkimEncryptionService: DkimEncryptionService,
        private readonly emailBlockService: EmailBlockService,
        private readonly bounceService: BounceService,
        private readonly configService: ConfigService,
    ) {}

    async sendMail(mail: SendMail): Promise<void> {
        await this.emailBlockService.assertNotBlocked(mail.to)

        const [localPart, fqdn] = mail.from.split('@')
        if (!localPart || !fqdn) {
            throw new Error(`Invalid from address: ${mail.from}`)
        }

        const domain = await this.domainService.getSendingDomainByFqdn(fqdn)
        if (!domain) {
            throw new Error(`No sending domain configured for ${fqdn}`)
        }

        const privateKey = await this.dkimEncryptionService.decryptDkimPrivateKey(domain.activeDkim.privateKey)
        const bounceAddress = this.configService.get<string>('BOUNCE_ADDRESS')

        try {
            await this.transporter.sendMail({
                from: mail.from,
                to: mail.to,
                replyTo: mail.replyTo,
                subject: mail.subject,
                html: mail.html,
                envelope: bounceAddress ? { from: bounceAddress, to: mail.to } : undefined,
                dkim: {
                    domainName: domain.fqdn,
                    keySelector: domain.activeDkim.selector,
                    privateKey,
                },
            })
        } catch (error) {
            await this.recordRejection(mail.to, error)
            throw error
        }

        this.logger.log(`Sent mail from ${mail.from} to ${mail.to}`)
    }

    private async recordRejection(emailAddress: string, error: unknown): Promise<void> {
        const responseCode =
            error instanceof Error ? (error as Error & { responseCode?: number }).responseCode : undefined
        if (!responseCode || responseCode < 500) {
            return
        }

        try {
            await this.bounceService.recordBounce({
                emailAddress,
                type: BounceType.PERMANENT,
                statusCode: String(responseCode),
                reason: error instanceof Error ? error.message : String(error),
                messageId: null,
                receivedAt: new Date(),
            })
        } catch (recordError) {
            const message = recordError instanceof Error ? recordError.message : String(recordError)
            this.logger.error(`Failed to record rejection bounce for ${emailAddress}: ${message}`)
        }
    }
}
