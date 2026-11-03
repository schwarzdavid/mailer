import { Inject, Injectable } from '@nestjs/common'
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { MAIL_TRANSPORTER } from '../../mail/mail.constants.js'
import { SMTP_HEALTH_TIMEOUT_MS } from '../health.constants.js'
import { probeWithin } from '../helpers/probe-within.js'

@Injectable()
export class SmtpHealthIndicator {
    constructor(
        @Inject(MAIL_TRANSPORTER)
        private readonly transporter: Pick<Transporter<SMTPTransport.SentMessageInfo>, 'verify'>,
        private readonly healthIndicatorService: HealthIndicatorService,
    ) {}

    isHealthy(key: string): Promise<HealthIndicatorResult> {
        return probeWithin(
            this.healthIndicatorService.check(key),
            () => this.transporter.verify(),
            SMTP_HEALTH_TIMEOUT_MS,
        )
    }
}
