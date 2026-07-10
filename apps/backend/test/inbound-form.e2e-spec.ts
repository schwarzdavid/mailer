import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest'
import { createTestApp } from './support/app'
import { login, seedUser, type Credentials } from './support/session'
import { InboundFormSubmissionModel } from '../src/modules/inbound-form/models/inbound-form-submission.model'
import { InboundFormDeliveryModel } from '../src/modules/inbound-form/models/inbound-form-delivery.model'

interface MailhogMessage {
    Content: {
        Headers: Record<string, string[]>
        Body: string
    }
}

interface MailhogMessages {
    total: number
    items: MailhogMessage[]
}

function header(message: MailhogMessage, name: string): string[] {
    const key = Object.keys(message.Content.Headers).find(
        (headerName) => headerName.toLowerCase() === name.toLowerCase(),
    )
    return key ? message.Content.Headers[key]! : []
}

describe('InboundForm (e2e)', () => {
    let app: INestApplication<App>
    let token: string
    let inboundFormId: number
    let inboundFormReceiverId: number
    const slug = 'e2e-contact'
    const mailhogUrl = inject('e2eEnv').MAILHOG_URL

    const credentials: Credentials = {
        email: 'inbound.form.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    async function fetchMessages(): Promise<MailhogMessages> {
        const response = await fetch(`${mailhogUrl}/api/v2/messages`)
        return (await response.json()) as MailhogMessages
    }

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, credentials)
        token = await login(app, credentials)

        const domainResponse = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'forms.inbound-example.com' })
            .expect(201)
        const domainId = (domainResponse.body as { domainId: number }).domainId

        const formResponse = await http()
            .post('/api/inbound-form')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'E2E Contact', slug, domainId })
            .expect(201)
        inboundFormId = (formResponse.body as { inboundFormId: number }).inboundFormId

        await http()
            .put(`/api/inbound-form/${inboundFormId}/fields`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                fields: [
                    { key: 'firstName', label: 'First name', type: 'text', validation: { required: true } },
                    { key: 'email', label: 'Email', type: 'email', validation: { required: true } },
                ],
            })
            .expect(200)

        await http()
            .put(`/api/inbound-form/${inboundFormId}/security`)
            .set('Authorization', `Bearer ${token}`)
            .send({ security: [{ type: 'honeypot', location: 'body', key: 'website' }] })
            .expect(200)

        const receiverResponse = await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                emailFrom: 'noreply@forms.inbound-example.com',
                emailReceiver: 'owner@business.com',
                emailReplyTo: '{{email}}',
            })
            .expect(201)
        inboundFormReceiverId = (receiverResponse.body as { inboundFormReceiverId: number }).inboundFormReceiverId

        await http()
            .put(`/api/inbound-form/${inboundFormId}/receiver/${inboundFormReceiverId}/template/draft`)
            .set('Authorization', `Bearer ${token}`)
            .send({ subject: 'Message from {{firstName}}', template: '<p>{{firstName}} ({{email}}) wrote in.</p>' })
            .expect(200)

        await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver/${inboundFormReceiverId}/template/publish`)
            .set('Authorization', `Bearer ${token}`)
            .expect(201)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('accepts a public submission, stores it and delivers a dkim-signed mail', async () => {
        const response = await http()
            .post(`/api/public/form/${slug}`)
            .send({
                security: { website: null },
                data: { firstName: 'Max', email: 'max@example.com' },
            })
            .expect(201)

        expect(response.body).toEqual({ status: 'accepted' })

        const submissionModel = app.get<typeof InboundFormSubmissionModel>(getModelToken(InboundFormSubmissionModel))
        const submission = await submissionModel.findOne({ where: { inboundFormId, status: 'accepted' } })
        expect(submission).not.toBeNull()
        expect(submission!.data).toEqual({ firstName: 'Max', email: 'max@example.com' })

        const deliveryModel = app.get<typeof InboundFormDeliveryModel>(getModelToken(InboundFormDeliveryModel))
        await vi.waitFor(
            async () => {
                const delivery = await deliveryModel.findOne({
                    where: { inboundFormSubmissionId: submission!.inboundFormSubmissionId },
                })
                expect(delivery?.status).toBe('sent')
                expect(delivery?.emailTo).toBe('owner@business.com')
            },
            { timeout: 15_000 },
        )

        const messages = await fetchMessages()
        expect(messages.total).toBeGreaterThanOrEqual(1)
        const message = messages.items[0]!
        expect(header(message, 'To')).toContain('owner@business.com')
        expect(header(message, 'Subject')[0]).toContain('Message from Max')
        expect(header(message, 'Reply-To')).toContain('max@example.com')
        expect(header(message, 'DKIM-Signature').length).toBeGreaterThan(0)
        expect(header(message, 'DKIM-Signature')[0]).toContain('d=forms.inbound-example.com')
    })

    it('answers a honeypot hit with success but stores spam and sends nothing', async () => {
        const messagesBefore = (await fetchMessages()).total

        await http()
            .post(`/api/public/form/${slug}`)
            .send({
                security: { website: 'http://spam.example' },
                data: { firstName: 'Bot', email: 'bot@example.com' },
            })
            .expect(201)

        const submissionModel = app.get<typeof InboundFormSubmissionModel>(getModelToken(InboundFormSubmissionModel))
        const spam = await submissionModel.findOne({ where: { inboundFormId, status: 'spam' } })
        expect(spam).not.toBeNull()

        const deliveryModel = app.get<typeof InboundFormDeliveryModel>(getModelToken(InboundFormDeliveryModel))
        const deliveries = await deliveryModel.count({
            where: { inboundFormSubmissionId: spam!.inboundFormSubmissionId },
        })
        expect(deliveries).toBe(0)
        expect((await fetchMessages()).total).toBe(messagesBefore)
    })

    it('rejects an unknown slug with 404', async () => {
        const response = await http().post('/api/public/form/does-not-exist').send({ data: {} })
        expect(response.status).toBe(404)
    })

    it('rejects invalid data with 400', async () => {
        const response = await http()
            .post(`/api/public/form/${slug}`)
            .send({ security: { website: null }, data: { firstName: 'Max', email: 'broken' } })
        expect(response.status).toBe(400)
    })
})
