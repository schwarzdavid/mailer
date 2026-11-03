import { describe, expect, it, vi } from 'vitest'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { MailTransporterLifecycle } from './mail-transporter-lifecycle.service.js'

describe('MailTransporterLifecycle', () => {
    it('closes the pooled transporter on application shutdown', () => {
        const close = vi.fn<Transporter<SMTPTransport.SentMessageInfo>['close']>()
        const lifecycle = new MailTransporterLifecycle({ close })

        lifecycle.onApplicationShutdown()

        expect(close).toHaveBeenCalledOnce()
    })
})
