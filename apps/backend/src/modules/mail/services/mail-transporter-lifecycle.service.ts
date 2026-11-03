import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { MAIL_TRANSPORTER } from '../mail.constants.js'

@Injectable()
export class MailTransporterLifecycle implements OnApplicationShutdown {
    constructor(
        @Inject(MAIL_TRANSPORTER)
        private readonly transporter: Pick<Transporter<SMTPTransport.SentMessageInfo>, 'close'>,
    ) {}

    onApplicationShutdown(): void {
        this.transporter.close()
    }
}
