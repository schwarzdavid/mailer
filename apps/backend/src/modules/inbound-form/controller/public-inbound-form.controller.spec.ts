import { Test } from '@nestjs/testing'
import { AppThrottlerGuard } from '../../throttler-storage/guards/app-throttler.guard.js'
import type { Request } from 'express'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PublicInboundFormController } from './public-inbound-form.controller.js'
import { InboundFormSubmissionService } from '../services/inbound-form-submission.service.js'
import { IssuedFormToken } from '../interfaces/inbound-form-token.interface.js'

describe('PublicInboundFormController', () => {
    let controller: PublicInboundFormController
    let submitForm: Mock<InboundFormSubmissionService['submitForm']>
    let issueToken: Mock<InboundFormSubmissionService['issueToken']>

    beforeEach(async () => {
        submitForm = vi.fn<typeof submitForm>().mockResolvedValue(undefined)
        issueToken = vi.fn<typeof issueToken>()

        const module = await Test.createTestingModule({
            controllers: [PublicInboundFormController],
            providers: [{ provide: InboundFormSubmissionService, useValue: { submitForm, issueToken } }],
        })
            .overrideGuard(AppThrottlerGuard)
            .useValue({ canActivate: () => true })
            .compile()

        controller = module.get(PublicInboundFormController)
    })

    it('delegates the submission with body, headers and query', async () => {
        const request = {
            headers: { 'x-captcha': 'token' },
            query: { captcha: 'q' },
            ip: '203.0.113.7',
        } as unknown as Request

        const result = await controller.submitInboundForm(
            'contact',
            { security: { honeypot: null }, data: { email: 'max@example.com' } },
            request,
        )

        expect(submitForm).toHaveBeenCalledWith(
            'contact',
            { security: { honeypot: null }, data: { email: 'max@example.com' } },
            { 'x-captcha': 'token' },
            { captcha: 'q' },
            '203.0.113.7',
        )
        expect(result).toEqual({ status: 'accepted' })
    })

    it('issues a token for the request origin and ip', async () => {
        const issued: IssuedFormToken = {
            token: 'payload.signature',
            notBefore: new Date('2026-10-20T10:00:03.000Z'),
            expiresAt: new Date('2026-10-20T11:00:00.000Z'),
            waitMs: 3000,
        }
        issueToken.mockResolvedValue(issued)
        const request = { headers: { origin: 'https://kunde.at' }, ip: '203.0.113.7' } as unknown as Request

        const result = await controller.issueInboundFormToken('contact', request)

        expect(issueToken).toHaveBeenCalledWith('contact', { origin: 'https://kunde.at' }, '203.0.113.7')
        expect(result).toEqual({
            token: 'payload.signature',
            notBefore: '2026-10-20T10:00:03.000Z',
            expiresAt: '2026-10-20T11:00:00.000Z',
            waitMs: 3000,
        })
    })
})
