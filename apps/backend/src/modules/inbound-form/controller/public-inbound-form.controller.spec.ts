import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { Request } from 'express'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PublicInboundFormController } from './public-inbound-form.controller.js'
import { InboundFormSubmissionService } from '../services/inbound-form-submission.service.js'
import { installInboundFormClient } from '../client/inbound-form-client.js'
import { IssuedFormToken } from '../interfaces/inbound-form-token.interface.js'

describe('PublicInboundFormController', () => {
    let module: TestingModule
    let controller: PublicInboundFormController
    let submitForm: Mock<InboundFormSubmissionService['submitForm']>
    let issueToken: Mock<InboundFormSubmissionService['issueToken']>

    beforeEach(async () => {
        submitForm = vi.fn<typeof submitForm>().mockResolvedValue(undefined)
        issueToken = vi.fn<typeof issueToken>()

        module = await Test.createTestingModule({
            controllers: [PublicInboundFormController],
            providers: [{ provide: InboundFormSubmissionService, useValue: { submitForm, issueToken } }],
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

    describe('over http', () => {
        let app: INestApplication<App>

        beforeEach(async () => {
            app = module.createNestApplication<INestApplication<App>>()
            await app.init()
        })

        afterEach(async () => {
            await app.close()
        })

        it('serves the client script', async () => {
            const response = await request(app.getHttpServer()).get('/public/form/client.js').buffer(true).expect(200)

            expect(response.headers['content-type']).toBe('application/javascript; charset=utf-8')
            expect(response.headers['cache-control']).toBe('public, max-age=86400')
            expect(response.text).toContain(installInboundFormClient.toString())
            expect(response.text).toContain('document.currentScript')
            expect(submitForm).not.toHaveBeenCalled()
        })
    })
})
