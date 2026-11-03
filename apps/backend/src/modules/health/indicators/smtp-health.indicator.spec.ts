import { Test } from '@nestjs/testing'
import { HealthIndicatorService } from '@nestjs/terminus'
import type { Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MAIL_TRANSPORTER } from '../../mail/mail.constants.js'
import { SMTP_HEALTH_TIMEOUT_MS } from '../health.constants.js'
import { SmtpHealthIndicator } from './smtp-health.indicator.js'

describe('SmtpHealthIndicator', () => {
    let indicator: SmtpHealthIndicator
    let verify: Mock<() => Promise<true>>

    beforeEach(async () => {
        verify = vi.fn<() => Promise<true>>()
        const transporter: Pick<Transporter<SMTPTransport.SentMessageInfo>, 'verify'> = { verify }

        const moduleRef = await Test.createTestingModule({
            providers: [
                SmtpHealthIndicator,
                HealthIndicatorService,
                { provide: MAIL_TRANSPORTER, useValue: transporter },
            ],
        }).compile()

        indicator = moduleRef.get(SmtpHealthIndicator)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('reports up when the SMTP server accepts the connection', async () => {
        verify.mockResolvedValue(true)

        await expect(indicator.isHealthy('smtp')).resolves.toEqual({ smtp: { status: 'up' } })
        expect(verify).toHaveBeenCalledOnce()
    })

    it('reports down with the error description when verification is rejected', async () => {
        verify.mockRejectedValue(
            Object.assign(new Error('Invalid login: 535 Authentication failed'), { code: 'EAUTH', responseCode: 535 }),
        )

        await expect(indicator.isHealthy('smtp')).resolves.toEqual({
            smtp: { status: 'down', message: 'Error (code EAUTH, responseCode 535)' },
        })
    })

    it('reports down once verification has not settled within the timeout', async () => {
        vi.useFakeTimers()
        verify.mockReturnValue(new Promise<never>(() => {}))

        const result = indicator.isHealthy('smtp')
        await vi.advanceTimersByTimeAsync(SMTP_HEALTH_TIMEOUT_MS)

        await expect(result).resolves.toEqual({ smtp: { status: 'down', message: 'Timed out after 5000 ms' } })
        expect(vi.getTimerCount()).toBe(0)
    })

    it('keeps waiting for verification until the timeout has fully elapsed', async () => {
        vi.useFakeTimers()
        let accept: (value: true) => void = () => {}
        verify.mockReturnValue(new Promise<true>((resolve) => (accept = resolve)))

        const result = indicator.isHealthy('smtp')
        await vi.advanceTimersByTimeAsync(SMTP_HEALTH_TIMEOUT_MS - 1)
        accept(true)

        await expect(result).resolves.toEqual({ smtp: { status: 'up' } })
        expect(vi.getTimerCount()).toBe(0)
    })
})
