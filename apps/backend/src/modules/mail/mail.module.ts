import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport } from 'nodemailer'
import { MAIL_TRANSPORTER } from './mail.constants'
import { MailService } from './services/mail.service'
import { TemplateRendererService } from './services/template-renderer.service'
import { DomainModule } from '../domain/domain.module'

@Module({
    imports: [DomainModule],
    providers: [
        {
            provide: MAIL_TRANSPORTER,
            inject: [ConfigService],
            useFactory(configService: ConfigService) {
                const user = configService.get<string>('SMTP_USER', '')
                const pass = configService.get<string>('SMTP_PASSWORD', '')

                return createTransport({
                    host: configService.getOrThrow<string>('SMTP_HOST'),
                    port: Number(configService.getOrThrow<string>('SMTP_PORT')),
                    secure: configService.get<string>('SMTP_SECURE', 'false') === 'true',
                    auth: user ? { user, pass } : undefined,
                })
            },
        },
        MailService,
        TemplateRendererService,
    ],
    exports: [MailService, TemplateRendererService],
})
export class MailModule {}
