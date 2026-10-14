import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { configureSendingDomain } from './support/sending-domain.js'
import { waitForMessagesTo } from './support/mailhog.js'
import { EmailBlockService } from '../src/modules/bounce/services/email-block.service.js'
import { MailMessageService } from '../src/modules/mail/services/mail-message.service.js'
import { MailMessageSource } from '../src/modules/mail/interfaces/mail-message.interface.js'

interface ApiKeyBody {
    apiKeyId: number
    name: string
    prefix: string
    lastUsedAt: string | null
    revokedAt: string | null
    key?: string
}

interface MessageBody {
    mailMessageId: number
    source: string
    apiKeyId: number | null
    emailTo: string
    status: string
}

describe('Public send API (e2e)', () => {
    let app: INestApplication<App>
    let ownerToken: string
    let readerToken: string
    let projectId: number
    let otherProjectId: number
    let key: string
    let apiKeyId: number

    const mailhogUrl = inject('e2eEnv').MAILHOG_URL
    const password = 'correct-horse-battery-staple'
    const ownerCredentials: Credentials = { email: 'psa-e2e.owner@example.com', password }
    const readerCredentials: Credentials = { email: 'psa-e2e.reader@example.com', password }
    const from = 'news@send.psa-example.com'

    const http = () => request(app.getHttpServer())
    const asOwner = () => `Bearer ${ownerToken}`
    const send = (body: Record<string, unknown>, apiKey = key) =>
        http().post('/api/v1/send').set('Authorization', `Bearer ${apiKey}`).send(body)

    async function createProjectWithDomain(name: string, fqdn: string): Promise<number> {
        const domain = await http().post('/api/domain').set('Authorization', asOwner()).send({ fqdn }).expect(201)
        const project = await http().post('/api/project').set('Authorization', asOwner()).send({ name }).expect(201)
        const id = (project.body as { projectId: number }).projectId
        await http()
            .post(`/api/project/${id}/domains`)
            .set('Authorization', asOwner())
            .send({ domainId: (domain.body as { domainId: number }).domainId })
            .expect(201)
        return id
    }

    async function createKey(name: string): Promise<ApiKeyBody> {
        const response = await http()
            .post(`/api/project/${projectId}/api-keys`)
            .set('Authorization', asOwner())
            .send({ name })
            .expect(201)
        return response.body as ApiKeyBody
    }

    async function messagePage(query = ''): Promise<{ items: MessageBody[]; total: number }> {
        const response = await http()
            .get(`/api/project/${projectId}/messages${query}`)
            .set('Authorization', asOwner())
            .expect(200)
        return response.body as { items: MessageBody[]; total: number }
    }

    async function messages(query = ''): Promise<MessageBody[]> {
        return (await messagePage(query)).items
    }

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, ownerCredentials)
        await seedUser(app, readerCredentials, 'user')
        ownerToken = await login(app, ownerCredentials)
        readerToken = await login(app, readerCredentials)
        await configureSendingDomain(app, ownerToken, 'mail.psa-sending.org')

        projectId = await createProjectWithDomain('E2E Public Send', 'send.psa-example.com')
        otherProjectId = await createProjectWithDomain('E2E Public Send Other', 'mail.psa-other.org')

        const users = await http().get('/api/user').set('Authorization', asOwner()).expect(200)
        const reader = (users.body as { userId: number; email: string }[]).find(
            (user) => user.email === readerCredentials.email,
        )!
        await http()
            .put(`/api/project/${projectId}/members/${reader.userId}`)
            .set('Authorization', asOwner())
            .send({ permissions: ['read'] })
            .expect(200)

        const created = await createKey('Newsletter')
        key = created.key!
        apiKeyId = created.apiKeyId
    })

    afterAll(async () => {
        await app?.close()
    })

    describe('key management', () => {
        it('returns the full key only on creation', async () => {
            expect(key).toMatch(/^sdm_[0-9A-Za-z]{8}_[A-Za-z0-9_-]{43}$/)

            const list = await http()
                .get(`/api/project/${projectId}/api-keys`)
                .set('Authorization', asOwner())
                .expect(200)
            const listed = (list.body as ApiKeyBody[]).find((apiKey) => apiKey.apiKeyId === apiKeyId)!
            expect(listed.prefix).toBe(key.slice(0, 12))
            expect(listed).not.toHaveProperty('key')
            expect(listed).not.toHaveProperty('secretHash')
        })

        it('lets readers list but not create or revoke keys', async () => {
            expect(
                (await http().get(`/api/project/${projectId}/api-keys`).set('Authorization', `Bearer ${readerToken}`))
                    .status,
            ).toBe(200)
            expect(
                (
                    await http()
                        .post(`/api/project/${projectId}/api-keys`)
                        .set('Authorization', `Bearer ${readerToken}`)
                        .send({ name: 'nope' })
                ).status,
            ).toBe(403)
            expect(
                (
                    await http()
                        .delete(`/api/project/${projectId}/api-keys/${apiKeyId}`)
                        .set('Authorization', `Bearer ${readerToken}`)
                ).status,
            ).toBe(403)
        })
    })

    describe('sending', () => {
        it('sends with a header key, logs the message and records key usage', async () => {
            const response = await send({
                from,
                to: 'reader1@psa-e2e.test',
                subject: 'Hello',
                html: '<p>Hi</p>',
                text: 'Hi',
            }).expect(202)
            const { mailMessageId, status } = response.body as { mailMessageId: number; status: string }
            expect(status).toBe('sent')

            const [delivered] = await waitForMessagesTo(mailhogUrl, 'reader1@psa-e2e.test')
            expect(delivered).toBeDefined()

            const logged = (await messages()).find((message) => message.mailMessageId === mailMessageId)!
            expect(logged).toEqual(
                expect.objectContaining({ source: 'api', apiKeyId, emailTo: 'reader1@psa-e2e.test', status: 'sent' }),
            )

            const list = await http()
                .get(`/api/project/${projectId}/api-keys`)
                .set('Authorization', asOwner())
                .expect(200)
            expect(
                (list.body as ApiKeyBody[]).find((apiKey) => apiKey.apiKeyId === apiKeyId)!.lastUsedAt,
            ).not.toBeNull()
        })

        it('accepts the key as a query parameter', async () => {
            expect(
                (
                    await http()
                        .post(`/api/v1/send?key=${encodeURIComponent(key)}`)
                        .send({ from, to: 'reader2@psa-e2e.test', subject: 'Hello', html: '<p>Hi</p>' })
                ).status,
            ).toBe(202)
        })

        it('accepts a mixed-case from domain', async () => {
            expect(
                (
                    await send({
                        from: 'News@Send.PSA-Example.com',
                        to: 'reader3@psa-e2e.test',
                        subject: 'Hi',
                        html: '<p>x</p>',
                    })
                ).status,
            ).toBe(202)
        })

        it('accepts an html body larger than the default json limit', async () => {
            expect(
                (
                    await send({
                        from,
                        to: 'reader4@psa-e2e.test',
                        subject: 'Big',
                        html: `<p>${'x'.repeat(200_000)}</p>`,
                    })
                ).status,
            ).toBe(202)
        })

        it('accepts multibyte html and text bodies at the payload maximum', async () => {
            const maximalMultibyteBody = '😀'.repeat(1_000_000)

            expect(
                (
                    await send({
                        from,
                        to: 'reader5@psa-e2e.test',
                        subject: 'Huge',
                        html: maximalMultibyteBody,
                        text: maximalMultibyteBody,
                    })
                ).status,
            ).toBe(202)
        })

        it('keeps the default json limit on every other route', async () => {
            expect(
                (
                    await http()
                        .post('/api/auth/login')
                        .send({ email: 'nobody@psa-e2e.test', password: 'x'.repeat(110_000) })
                ).status,
            ).toBe(413)
        })

        it('rejects missing and malformed keys', async () => {
            expect(
                (await http().post('/api/v1/send').send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }))
                    .status,
            ).toBe(401)
            expect((await send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }, 'not-a-key')).status).toBe(401)
        })

        it('does not accept a JWT in place of an api key', async () => {
            expect((await send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }, ownerToken)).status).toBe(401)
        })

        it('validates the payload', async () => {
            expect((await send({ from: 'not-an-address', to: 'x@psa-e2e.test', subject: 'x', html: 'x' })).status).toBe(
                400,
            )
            expect((await send({ from, to: 'x@psa-e2e.test', subject: '', html: 'x' })).status).toBe(400)
        })

        it('forbids a from domain of another project', async () => {
            const response = await send({
                from: 'news@mail.psa-other.org',
                to: 'x@psa-e2e.test',
                subject: 'x',
                html: 'x',
            }).expect(403)
            expect((response.body as { code: string }).code).toBe('FROM_DOMAIN_NOT_ALLOWED')
            expect(otherProjectId).toBeGreaterThan(0)
        })

        it('reports a blocked recipient and logs it as blocked', async () => {
            await app.get(EmailBlockService).applyBlock('blocked@psa-e2e.test')

            const response = await send({ from, to: 'blocked@psa-e2e.test', subject: 'x', html: 'x' }).expect(422)
            const body = response.body as { code: string; mailMessageId: number }
            expect(body.code).toBe('RECIPIENT_BLOCKED')

            const logged = (await messages('?status=blocked')).find(
                (message) => message.mailMessageId === body.mailMessageId,
            )
            expect(logged).toBeDefined()
        })

        it('rejects keys of a trashed project', async () => {
            const trashed = await createProjectWithDomain('E2E Public Send Trash', 'mail.psa-trash.org')
            const trashedKey = await http()
                .post(`/api/project/${trashed}/api-keys`)
                .set('Authorization', asOwner())
                .send({ name: 'Trash' })
                .expect(201)
            expect((await http().delete(`/api/project/${trashed}`).set('Authorization', asOwner())).status).toBe(200)

            expect(
                (
                    await send(
                        { from: 'news@mail.psa-trash.org', to: 'x@psa-e2e.test', subject: 'x', html: 'x' },
                        (trashedKey.body as ApiKeyBody).key,
                    )
                ).status,
            ).toBe(401)

            await http().post(`/api/project/${trashed}/restore`).set('Authorization', asOwner()).expect(201)
        })
    })

    describe('message log', () => {
        it('pages newest first with a total', async () => {
            const first = await messagePage('?itemsPerPage=1')
            const second = await messagePage('?itemsPerPage=1&page=2')

            expect(first.items).toHaveLength(1)
            expect(first.total).toBeGreaterThan(1)
            expect(second.total).toBe(first.total)
            expect(second.items[0]!.mailMessageId).toBeLessThan(first.items[0]!.mailMessageId)
        })

        it('filters by source and searches the recipient', async () => {
            const found = await messages('?source=api&search=reader1%40psa')

            expect(found.map((message) => message.emailTo)).toEqual(['reader1@psa-e2e.test'])
        })

        it('rejects an oversized page', async () => {
            expect(
                (
                    await http()
                        .get(`/api/project/${projectId}/messages?itemsPerPage=101`)
                        .set('Authorization', asOwner())
                ).status,
            ).toBe(400)
        })

        it('hides the log of projects the caller cannot read', async () => {
            expect(
                (
                    await http()
                        .get(`/api/project/${otherProjectId}/messages`)
                        .set('Authorization', `Bearer ${readerToken}`)
                ).status,
            ).toBe(404)
        })

        it('records rendered inbound-form subjects longer than an RFC 5322 line', async () => {
            const renderedSubject = `New submission: ${'s'.repeat(5_000)}`

            const recorded = await app.get(MailMessageService).recordPending({
                projectId,
                source: MailMessageSource.INBOUND_FORM,
                apiKeyId: null,
                emailFrom: from,
                emailTo: 'owner@psa-e2e.test',
                subject: renderedSubject,
            })

            expect(recorded.subject).toBe(renderedSubject)
        })
    })

    describe('revocation and rate limiting', () => {
        it('rejects a revoked key', async () => {
            const revocable = await createKey('Revocable')
            expect(
                (
                    await http()
                        .delete(`/api/project/${projectId}/api-keys/${revocable.apiKeyId}`)
                        .set('Authorization', asOwner())
                ).status,
            ).toBe(204)

            expect((await send({ from, to: 'x@psa-e2e.test', subject: 'x', html: 'x' }, revocable.key)).status).toBe(
                401,
            )
        })

        it('throttles a key after the configured limit without letting forged secrets of its prefix drain it', async () => {
            const limited = await createKey('Limited')
            const forged = `${limited.prefix}_${'A'.repeat(43)}`
            const invalidBody = { from, to: 'not-an-address', subject: 'x', html: 'x' }

            const forgedStatuses: number[] = []
            for (let attempt = 0; attempt <= 60; attempt++) {
                forgedStatuses.push((await send(invalidBody, forged)).status)
            }
            expect(forgedStatuses.slice(0, 60)).not.toContain(429)
            expect(forgedStatuses[60]).toBe(429)

            const realStatuses: number[] = []
            for (let attempt = 0; attempt <= 60; attempt++) {
                realStatuses.push((await send(invalidBody, limited.key)).status)
            }
            expect(realStatuses.slice(0, 60)).toEqual(Array<number>(60).fill(400))
            expect(realStatuses[60]).toBe(429)
        })
    })
})
