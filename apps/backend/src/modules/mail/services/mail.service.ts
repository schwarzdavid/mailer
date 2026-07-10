import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Transporter } from 'nodemailer'
import { MAIL_TRANSPORTER } from '../mail.constants'
import { DomainService } from '../../domain/services/domain.service'
import { DkimEncryptionService } from '../../domain/services/dkim-encryption.service'

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
    ) {}

    async sendMail(mail: SendMail): Promise<void> {
        const [localPart, fqdn] = mail.from.split('@')
        if (!localPart || !fqdn) {
            throw new Error(`Invalid from address: ${mail.from}`)
        }

        const domain = await this.domainService.getSendingDomainByFqdn(fqdn)
        if (!domain) {
            throw new Error(`No sending domain configured for ${fqdn}`)
        }

        const privateKey = await this.dkimEncryptionService.decryptDkimPrivateKey(domain.activeDkim.privateKey)

        await this.transporter.sendMail({
            from: mail.from,
            to: mail.to,
            replyTo: mail.replyTo,
            subject: mail.subject,
            html: mail.html,
            dkim: {
                domainName: domain.fqdn,
                keySelector: domain.activeDkim.selector,
                privateKey,
            },
        })

        this.logger.log(`Sent mail from ${mail.from} to ${mail.to}`)
    }
}
