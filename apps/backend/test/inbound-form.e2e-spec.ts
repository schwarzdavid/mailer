import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { configureSendingDomain } from './support/sending-domain.js'
import { resetThrottleCounters } from './support/throttle-counters.js'
import { InboundFormSubmissionModel } from '../src/modules/inbound-form/models/inbound-form-submission.model.js'
import { InboundFormDeliveryModel } from '../src/modules/inbound-form/models/inbound-form-delivery.model.js'
import { fetchMessages as fetchMailhogMessages, header, parseMessage, type MailhogMessages } from './support/mailhog.js'

describe('InboundForm (e2e)', () => {
    let app: INestApplication<App>
    let token: string
    let inboundFormId: number
    let inboundFormReceiverId: number
    let domainId: number
    let projectId: number
    const slug = 'e2e-contact'
    const mailhogUrl = inject('e2eEnv').MAILHOG_URL

    const credentials: Credentials = {
        email: 'inbound.form.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    async function fetchMessages(): Promise<MailhogMessages> {
        return await fetchMailhogMessages(mailhogUrl)
    }

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, credentials)
        token = await login(app, credentials)
        await configureSendingDomain(app, token)

        const domainResponse = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'forms.inbound-example.com' })
            .expect(201)
        domainId = (domainResponse.body as { domainId: number }).domainId

        const projectResponse = await http()
            .post('/api/project')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'E2E Inbound' })
            .expect(201)
        projectId = (projectResponse.body as { projectId: number }).projectId

        await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', `Bearer ${token}`)
            .send({ domainId })
            .expect(201)

        const formResponse = await http()
            .post('/api/inbound-form')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'E2E Contact', slug, domainId, projectId })
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

    beforeEach(async () => {
        await resetThrottleCounters()
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

    it('returns fields in the order they were saved and keeps a reorder', async () => {
        const formResponse = await http()
            .post('/api/inbound-form')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'E2E Ordering', slug: 'e2e-ordering', domainId, projectId })
            .expect(201)
        const orderingFormId = (formResponse.body as { inboundFormId: number }).inboundFormId
        const field = (key: string) => ({ key, label: key, type: 'text' })
        const savedKeys = async (keys: string[]) => {
            const saved = await http()
                .put(`/api/inbound-form/${orderingFormId}/fields`)
                .set('Authorization', `Bearer ${token}`)
                .send({ fields: keys.map(field) })
                .expect(200)
            const loaded = await http()
                .get(`/api/inbound-form/${orderingFormId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
            return {
                saved: (saved.body as { key: string }[]).map((entry) => entry.key),
                loaded: (loaded.body as { fields: { key: string }[] }).fields.map((entry) => entry.key),
            }
        }

        const initial = ['zip', 'city', 'street', 'name']
        await expect(savedKeys(initial)).resolves.toEqual({ saved: initial, loaded: initial })

        const reordered = ['name', 'street', 'extra', 'zip', 'city']
        await expect(savedKeys(reordered)).resolves.toEqual({ saved: reordered, loaded: reordered })
    })

    it('rejects a backtracking-prone field pattern', async () => {
        const response = await http()
            .put(`/api/inbound-form/${inboundFormId}/fields`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                fields: [
                    { key: 'firstName', label: 'First name', type: 'text', validation: { pattern: '^(a+)+$' } },
                    { key: 'email', label: 'Email', type: 'email', validation: { required: true } },
                ],
            })
            .expect(400)

        expect(JSON.stringify(response.body)).toContain('firstName')
    })

    it('renders the mail subject without html escaping', async () => {
        await http()
            .post(`/api/public/form/${slug}`)
            .send({
                security: { website: null },
                data: { firstName: "O'Brien & Co", email: 'obrien@example.com' },
            })
            .expect(201)

        const subject = await vi.waitFor(
            async () => {
                const parsed = await Promise.all((await fetchMessages()).items.map((message) => parseMessage(message)))
                const match = parsed.find((mail) => mail.replyTo?.text.includes('obrien@example.com'))
                expect(match).toBeDefined()
                return match!.subject
            },
            { timeout: 15_000, interval: 250 },
        )

        expect(subject).toBe("Message from O'Brien & Co")
    })

    describe('allowed hostnames', () => {
        const submit = () =>
            http()
                .post(`/api/public/form/${slug}`)
                .send({ security: { website: null }, data: { firstName: 'Max', email: 'max@example.com' } })

        const setHostnames = async (allowedHostnames: string[]) => {
            await http()
                .patch(`/api/inbound-form/${inboundFormId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ allowedHostnames })
                .expect(200)
        }

        beforeAll(async () => {
            await setHostnames(['kunde.at'])
        })

        afterAll(async () => {
            await setHostnames([])
        })

        it('accepts a listed origin with port and uppercase', async () => {
            const response = await submit().set('Origin', 'https://Kunde.at:8443')
            expect(response.status).toBe(201)
        })

        it('rejects a foreign origin', async () => {
            const response = await submit().set('Origin', 'https://evil.at')
            expect(response.status).toBe(403)
        })

        it('rejects a request without origin and referer', async () => {
            const response = await submit()
            expect(response.status).toBe(403)
        })

        it('rejects an opaque origin', async () => {
            const response = await submit().set('Origin', 'null')
            expect(response.status).toBe(403)
        })
    })

    describe('timed token', () => {
        const timedSlug = 'e2e-timed-token'
        const origin = 'https://kunde.at'
        const validData = { firstName: 'Max', email: 'max@example.com' }

        interface IssuedToken {
            token: string
            notBefore: string
            expiresAt: string
            waitMs: number
        }

        const requestToken = () => http().post(`/api/public/form/${timedSlug}/token`).set('Origin', origin)

        const fetchToken = async (): Promise<IssuedToken> => {
            const response = await requestToken().expect(201)
            return response.body as IssuedToken
        }

        const waitOut = (issued: IssuedToken) => new Promise((resolve) => setTimeout(resolve, issued.waitMs + 50))

        const fetchUsableToken = async (): Promise<string> => {
            const issued = await fetchToken()
            await waitOut(issued)
            return issued.token
        }

        const submit = (formToken: string, data: Record<string, unknown>) =>
            http().post(`/api/public/form/${timedSlug}`).set('Origin', origin).send({ security: { formToken }, data })

        beforeAll(async () => {
            await resetThrottleCounters()

            const formResponse = await http()
                .post('/api/inbound-form')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'E2E Timed Token', slug: timedSlug, domainId, projectId })
                .expect(201)
            const timedFormId = (formResponse.body as { inboundFormId: number }).inboundFormId

            await http()
                .patch(`/api/inbound-form/${timedFormId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ allowedHostnames: ['kunde.at'] })
                .expect(200)

            await http()
                .put(`/api/inbound-form/${timedFormId}/fields`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    fields: [
                        { key: 'firstName', label: 'First name', type: 'text', validation: { required: true } },
                        { key: 'email', label: 'Email', type: 'email', validation: { required: true } },
                    ],
                })
                .expect(200)

            await http()
                .put(`/api/inbound-form/${timedFormId}/security`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    security: [
                        {
                            type: 'timed-token',
                            location: 'body',
                            key: 'formToken',
                            config: { minDelaySeconds: 1, maxAgeSeconds: 60 },
                        },
                    ],
                })
                .expect(200)
        })

        it('issues a token to a listed origin', async () => {
            const issued = await fetchToken()

            expect(issued.token).toMatch(/^[\w-]+\.[\w-]+$/)
            expect(new Date(issued.notBefore).toISOString()).toBe(issued.notBefore)
            expect(new Date(issued.expiresAt).toISOString()).toBe(issued.expiresAt)
            expect(issued.waitMs).toBeGreaterThanOrEqual(1000)
            expect(issued.waitMs).toBeLessThanOrEqual(2000)
        })

        it('refuses a token to a foreign origin', async () => {
            const response = await http().post(`/api/public/form/${timedSlug}/token`).set('Origin', 'https://evil.at')
            expect(response.status).toBe(403)
        })

        it('refuses a token for a form without the timed token scheme', async () => {
            const response = await http().post(`/api/public/form/${slug}/token`).set('Origin', origin)
            expect(response.status).toBe(404)
        })

        it('rejects a token submitted before its delay has passed', async () => {
            let issued = await fetchToken()
            if (issued.waitMs < 500) {
                await waitOut(issued)
                issued = await fetchToken()
            }

            const response = await submit(issued.token, validData)

            expect(response.status).toBe(403)
            expect((response.body as { message: string }).message).toContain('not yet valid')
        })

        it('accepts a token once after its delay and rejects its reuse', async () => {
            const formToken = await fetchUsableToken()

            await submit(formToken, validData).expect(201)
            const reuse = await submit(formToken, validData)

            expect(reuse.status).toBe(403)
            expect((reuse.body as { message: string }).message).toContain('already used')
        })

        it('keeps a token usable after a failed field validation', async () => {
            const formToken = await fetchUsableToken()

            const invalid = await submit(formToken, { firstName: 'Max', email: 'broken' })
            const retry = await submit(formToken, validData)

            expect(invalid.status).toBe(400)
            expect(retry.status).toBe(201)
        })

        it('serves the client script', async () => {
            const response = await http().get('/api/public/form/client.js').buffer(true).expect(200)

            expect(response.headers['content-type']).toBe('application/javascript; charset=utf-8')
            expect(response.headers['cache-control']).toBe('public, max-age=86400')
            expect(response.text).toContain('InboundForm')
        })
    })
})
