import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { Request } from 'express'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PublicInboundFormController } from './public-inbound-form.controller'
import { InboundFormSubmissionService } from '../services/inbound-form-submission.service'

describe('PublicInboundFormController', () => {
    let controller: PublicInboundFormController
    let submitForm: Mock<InboundFormSubmissionService['submitForm']>

    beforeEach(async () => {
        submitForm = vi.fn<typeof submitForm>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [PublicInboundFormController],
            providers: [{ provide: InboundFormSubmissionService, useValue: { submitForm } }],
        })
            .overrideGuard(ThrottlerGuard)
            .useValue({ canActivate: () => true })
            .compile()

        controller = module.get(PublicInboundFormController)
    })

    it('delegates the submission with body, headers and query', async () => {
        const request = {
            headers: { 'x-captcha': 'token' },
            query: { captcha: 'q' },
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
        )
        expect(result).toEqual({ status: 'accepted' })
    })
})
