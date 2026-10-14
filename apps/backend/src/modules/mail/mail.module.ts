import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SequelizeModule } from '@nestjs/sequelize'
import { createTransport } from 'nodemailer'
import { MAIL_TRANSPORTER } from './mail.constants.js'
import { MailMessageController } from './controller/mail-message.controller.js'
import { MailService } from './services/mail.service.js'
import { MailMessageService } from './services/mail-message.service.js'
import { TemplateRendererService } from './services/template-renderer.service.js'
import { DomainModule } from '../domain/domain.module.js'
import { EncryptionModule } from '../encryption/encryption.module.js'
import { BounceModule } from '../bounce/bounce.module.js'
import { MailMessageModel } from './models/mail-message.model.js'
import type { Env } from '../../config/env.schema.js'

@Module({
    imports: [SequelizeModule.forFeature([MailMessageModel]), DomainModule, BounceModule, EncryptionModule],
    controllers: [MailMessageController],
    providers: [
        {
            provide: MAIL_TRANSPORTER,
            inject: [ConfigService],
            useFactory(configService: ConfigService<Env, true>) {
                const user = configService.get('SMTP_USER', { infer: true })
                const pass = configService.get('SMTP_PASSWORD', { infer: true })

                return createTransport({
                    host: configService.get('SMTP_HOST', { infer: true }),
                    port: configService.get('SMTP_PORT', { infer: true }),
                    secure: configService.get('SMTP_SECURE', { infer: true }),
                    auth: user ? { user, pass } : undefined,
                })
            },
        },
        MailService,
        MailMessageService,
        TemplateRendererService,
    ],
    exports: [MailService, MailMessageService, TemplateRendererService],
})
export class MailModule {}
