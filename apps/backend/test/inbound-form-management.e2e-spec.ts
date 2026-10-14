import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { configureSendingDomain } from './support/sending-domain.js'
import { fetchMessagesTo, header, parseMessage, waitForMessagesTo } from './support/mailhog.js'
import { InboundFormSubmissionModel } from '../src/modules/inbound-form/models/inbound-form-submission.model.js'
import { InboundFormDeliveryModel } from '../src/modules/inbound-form/models/inbound-form-delivery.model.js'
import { InboundFormSecurityModel } from '../src/modules/inbound-form/models/inbound-form-security.model.js'
import { decryptSecret } from '../src/helpers/secret-encryption.js'

interface FormBody {
    inboundFormId: number
    projectId: number
    domainId: number | null
    name: string
    slug: string
    isActive: boolean
}

interface ReceiverBody {
    inboundFormReceiverId: number
    emailFrom: string
    emailReceiver: string
    emailReplyTo: string | null
    isActive: boolean
    draftVersion: number | null
    publishedVersion: number | null
}

interface FormDetailBody extends FormBody {
    fields: { key: string; type: string }[]
    security: { type: string; location: string; key: string }[]
    receivers: ReceiverBody[]
}

interface TemplateBody {
    inboundFormTemplateId: number
    inboundFormReceiverId: number
    subject: string
    template: string
    status: 'draft' | 'published'
    version: number
}

describe('InboundForm management + delivery (e2e)', () => {
    let app: INestApplication<App>
    let ownerToken: string
    let viewerToken: string
    let outsiderToken: string
    let projectId: number
    let domainId: number
    let formId: number
    let ownerReceiverId: number
    let echoReceiverId: number
    let captchaFormId: number

    const mailhogUrl = inject('e2eEnv').MAILHOG_URL
    const encryptionSecret = inject('e2eEnv').BACKEND_ENCRYPTION_SECRET
    const slug = 'e2e-ifm-contact'
    const captchaSlug = 'e2e-ifm-captcha'
    const ownerAddress = 'owner@ifm-e2e.test'
    const inactiveAddress = 'inactive@ifm-e2e.test'
    const unpublishedAddress = 'unpublished@ifm-e2e.test'
    const password = 'correct-horse-battery-staple'
    const ownerCredentials: Credentials = { email: 'ifm-e2e.owner@example.com', password }
    const viewerCredentials: Credentials = { email: 'ifm-e2e.viewer@example.com', password }
    const outsiderCredentials: Credentials = { email: 'ifm-e2e.outsider@example.com', password }

    const http = () => request(app.getHttpServer())
    const bearer = (token: string) => `Bearer ${token}`
    const asOwner = () => bearer(ownerToken)

    const submissionModel = () => app.get<typeof InboundFormSubmissionModel>(getModelToken(InboundFormSubmissionModel))
    const deliveryModel = () => app.get<typeof InboundFormDeliveryModel>(getModelToken(InboundFormDeliveryModel))

    async function latestSubmission(inboundFormId: number): Promise<InboundFormSubmissionModel | null> {
        return await submissionModel().findOne({
            where: { inboundFormId },
            order: [['inboundFormSubmissionId', 'DESC']],
        })
    }

    async function createReceiver(body: Record<string, unknown>): Promise<ReceiverBody> {
        const response = await http()
            .post(`/api/inbound-form/${formId}/receiver`)
            .set('Authorization', asOwner())
            .send(body)
            .expect(201)
        return response.body as ReceiverBody
    }

    async function saveDraft(receiverId: number, subject: string, template: string): Promise<TemplateBody> {
        const response = await http()
            .put(`/api/inbound-form/${formId}/receiver/${receiverId}/template/draft`)
            .set('Authorization', asOwner())
            .send({ subject, template })
            .expect(200)
        return response.body as TemplateBody
    }

    async function publish(receiverId: number): Promise<TemplateBody> {
        const response = await http()
            .post(`/api/inbound-form/${formId}/receiver/${receiverId}/template/publish`)
            .set('Authorization', asOwner())
            .expect(201)
        return response.body as TemplateBody
    }

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, ownerCredentials)
        await seedUser(app, viewerCredentials, 'user')
        await seedUser(app, outsiderCredentials, 'user')
        ownerToken = await login(app, ownerCredentials)
        viewerToken = await login(app, viewerCredentials)
        outsiderToken = await login(app, outsiderCredentials)
        await configureSendingDomain(app, ownerToken, 'mail.ifm-sending.org')

        const domain = await http()
            .post('/api/domain')
            .set('Authorization', asOwner())
            .send({ fqdn: 'forms.ifm-example.com' })
            .expect(201)
        domainId = (domain.body as { domainId: number }).domainId

        const project = await http()
            .post('/api/project')
            .set('Authorization', asOwner())
            .send({ name: 'E2E Inbound Management' })
            .expect(201)
        projectId = (project.body as { projectId: number }).projectId

        await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', asOwner())
            .send({ domainId })
            .expect(201)

        const users = await http().get('/api/user').set('Authorization', asOwner()).expect(200)
        const viewer = (users.body as { userId: number; email: string }[]).find(
            (user) => user.email === viewerCredentials.email,
        )!
        await http()
            .put(`/api/project/${projectId}/members/${viewer.userId}`)
            .set('Authorization', asOwner())
            .send({ permissions: ['read'] })
            .expect(200)
    })

    afterAll(async () => {
        await app?.close()
    })

    describe('authentication', () => {
        it.each([
            ['get', '/api/inbound-form'],
            ['post', '/api/inbound-form'],
            ['get', '/api/inbound-form/1'],
            ['patch', '/api/inbound-form/1'],
            ['delete', '/api/inbound-form/1'],
            ['put', '/api/inbound-form/1/fields'],
            ['put', '/api/inbound-form/1/security'],
            ['post', '/api/inbound-form/1/receiver'],
            ['patch', '/api/inbound-form/1/receiver/1'],
            ['delete', '/api/inbound-form/1/receiver/1'],
            ['get', '/api/inbound-form/1/receiver/1/template'],
            ['put', '/api/inbound-form/1/receiver/1/template/draft'],
            ['post', '/api/inbound-form/1/receiver/1/template/publish'],
        ] as const)('rejects %s %s without a token', async (method, path) => {
            const response = await http()[method](path)

            expect(response.status).toBe(401)
        })
    })

    describe('form setup', () => {
        it('creates a form', async () => {
            const response = await http()
                .post('/api/inbound-form')
                .set('Authorization', asOwner())
                .send({ name: 'IFM Contact', slug, domainId, projectId })
                .expect(201)
            const body = response.body as FormBody

            formId = body.inboundFormId
            expect(body).toMatchObject({ name: 'IFM Contact', slug, domainId, projectId, isActive: true })
        })

        it.each([
            ['an invalid slug', { name: 'Bad', slug: 'Not A Slug!' }],
            ['a missing name', { slug: 'e2e-ifm-noname' }],
            ['a missing project', { name: 'No project', slug: 'e2e-ifm-noproject', projectId: undefined }],
        ])('rejects %s with 400', async (_case, overrides) => {
            const response = await http()
                .post('/api/inbound-form')
                .set('Authorization', asOwner())
                .send({ domainId, projectId, ...overrides })

            expect(response.status).toBe(400)
        })

        it('rejects a duplicate slug and an unknown project with 400', async () => {
            await http()
                .post('/api/inbound-form')
                .set('Authorization', asOwner())
                .send({ name: 'Dup', slug, domainId, projectId })
                .expect(400)
            const unknownProject = await http()
                .post('/api/inbound-form')
                .set('Authorization', asOwner())
                .send({ name: 'Ghost', slug: 'e2e-ifm-ghost', domainId, projectId: 999_999 })
            expect(unknownProject.status).toBe(400)
        })

        it('denies form creation to a read-only member', async () => {
            const response = await http()
                .post('/api/inbound-form')
                .set('Authorization', bearer(viewerToken))
                .send({ name: 'Viewer form', slug: 'e2e-ifm-viewer', domainId, projectId })

            expect(response.status).toBe(403)
        })

        it('replaces fields and validates them', async () => {
            const response = await http()
                .put(`/api/inbound-form/${formId}/fields`)
                .set('Authorization', asOwner())
                .send({
                    fields: [
                        { key: 'name', label: 'Name', type: 'text', validation: { required: true } },
                        { key: 'email', label: 'Email', type: 'email', validation: { required: true } },
                        { key: 'message', label: 'Message', type: 'text', validation: { maxLength: 200 } },
                        { key: 'age', label: 'Age', type: 'number', validation: { min: 18 } },
                        { key: 'newsletter', label: 'Newsletter', type: 'boolean', defaultValue: 'false' },
                    ],
                })
                .expect(200)
            expect((response.body as { key: string }[]).map((field) => field.key)).toEqual([
                'name',
                'email',
                'message',
                'age',
                'newsletter',
            ])

            await http()
                .put(`/api/inbound-form/${formId}/fields`)
                .set('Authorization', asOwner())
                .send({
                    fields: [
                        { key: 'dup', label: 'A', type: 'text' },
                        { key: 'dup', label: 'B', type: 'text' },
                    ],
                })
                .expect(400)
            await http()
                .put(`/api/inbound-form/${formId}/fields`)
                .set('Authorization', asOwner())
                .send({ fields: [{ key: 'broken', label: 'Broken', type: 'text', validation: { pattern: '(' } }] })
                .expect(400)
            await http()
                .put(`/api/inbound-form/${formId}/fields`)
                .set('Authorization', asOwner())
                .send({ fields: [{ key: 'kind', label: 'Kind', type: 'colour' }] })
                .expect(400)
        })

        it('replaces security schemes and rejects unsupported ones', async () => {
            const response = await http()
                .put(`/api/inbound-form/${formId}/security`)
                .set('Authorization', asOwner())
                .send({ security: [{ type: 'honeypot', location: 'query', key: 'trap' }] })
                .expect(200)
            expect(response.body).toEqual([
                expect.objectContaining({ type: 'honeypot', location: 'query', key: 'trap', config: null }),
            ])

            await http()
                .put(`/api/inbound-form/${formId}/security`)
                .set('Authorization', asOwner())
                .send({ security: [{ type: 'csrf', location: 'header', key: 'x-csrf' }] })
                .expect(400)
            await http()
                .put(`/api/inbound-form/${formId}/security`)
                .set('Authorization', asOwner())
                .send({
                    security: [
                        { type: 'honeypot', location: 'body', key: 'a' },
                        { type: 'honeypot', location: 'body', key: 'b' },
                    ],
                })
                .expect(400)
        })

        it('creates receivers and validates sender and recipient', async () => {
            ownerReceiverId = (
                await createReceiver({
                    emailFrom: 'contact@forms.ifm-example.com',
                    emailReceiver: ownerAddress,
                    emailReplyTo: '{{email}}',
                })
            ).inboundFormReceiverId
            echoReceiverId = (
                await createReceiver({
                    emailFrom: 'noreply@forms.ifm-example.com',
                    emailReceiver: '{{ email }}',
                })
            ).inboundFormReceiverId
            const inactive = await createReceiver({
                emailFrom: 'noreply@forms.ifm-example.com',
                emailReceiver: inactiveAddress,
                isActive: false,
            })
            const unpublished = await createReceiver({
                emailFrom: 'noreply@forms.ifm-example.com',
                emailReceiver: unpublishedAddress,
            })
            expect(inactive).toMatchObject({ isActive: false, draftVersion: null, publishedVersion: null })

            await saveDraft(inactive.inboundFormReceiverId, 'Inactive', '<p>never</p>')
            await publish(inactive.inboundFormReceiverId)
            await saveDraft(unpublished.inboundFormReceiverId, 'Draft only', '<p>never</p>')

            const invalid: Record<string, unknown>[] = [
                { emailFrom: 'contact@other-domain.com', emailReceiver: ownerAddress },
                { emailFrom: 'contact@forms.ifm-example.com', emailReceiver: '{{name}}' },
                { emailFrom: 'contact@forms.ifm-example.com', emailReceiver: '{{missing}}' },
                { emailFrom: 'contact@forms.ifm-example.com', emailReceiver: 'not an address' },
                { emailFrom: 'not-an-email', emailReceiver: ownerAddress },
            ]
            for (const body of invalid) {
                await http()
                    .post(`/api/inbound-form/${formId}/receiver`)
                    .set('Authorization', asOwner())
                    .send(body)
                    .expect(400)
            }
        })

        it('keeps fields referenced by receivers as email fields', async () => {
            const response = await http()
                .put(`/api/inbound-form/${formId}/fields`)
                .set('Authorization', asOwner())
                .send({ fields: [{ key: 'name', label: 'Name', type: 'text' }] })

            expect(response.status).toBe(400)
        })

        it('versions templates as drafts and publications', async () => {
            await http()
                .post(`/api/inbound-form/${formId}/receiver/${ownerReceiverId}/template/publish`)
                .set('Authorization', asOwner())
                .expect(404)

            const draft = await saveDraft(ownerReceiverId, 'Old subject', '<p>old</p>')
            expect(draft).toMatchObject({ status: 'draft', version: 1 })
            const updatedDraft = await saveDraft(ownerReceiverId, 'Inquiry from {{name}}', '<p>v1</p>')
            expect(updatedDraft).toMatchObject({ inboundFormTemplateId: draft.inboundFormTemplateId, version: 1 })
            expect(await publish(ownerReceiverId)).toMatchObject({ status: 'published', version: 1 })

            const second = await saveDraft(
                ownerReceiverId,
                'Inquiry from {{name}}',
                '<h1>New inquiry</h1><p>{{name}} &lt;{{email}}&gt; wrote:</p><p>{{message}}</p>' +
                    '{{#if newsletter}}<p>Wants the newsletter</p>{{else}}<p>No newsletter</p>{{/if}}',
            )
            expect(second).toMatchObject({ status: 'draft', version: 2 })

            const list = await http()
                .get(`/api/inbound-form/${formId}/receiver/${ownerReceiverId}/template`)
                .set('Authorization', asOwner())
                .expect(200)
            expect((list.body as TemplateBody[]).map(({ version, status }) => ({ version, status }))).toEqual([
                { version: 2, status: 'draft' },
                { version: 1, status: 'published' },
            ])

            expect(await publish(ownerReceiverId)).toMatchObject({ status: 'published', version: 2 })

            await saveDraft(echoReceiverId, 'Thanks {{name}}', '<p>We received your message, {{name}}.</p>')
            await publish(echoReceiverId)
        })

        it('refuses to publish an invalid or empty template', async () => {
            await saveDraft(echoReceiverId, 'Broken', '<p>{{#if name}}unterminated</p>')
            await http()
                .post(`/api/inbound-form/${formId}/receiver/${echoReceiverId}/template/publish`)
                .set('Authorization', asOwner())
                .expect(400)

            await saveDraft(echoReceiverId, '   ', '<p>body</p>')
            const emptySubject = await http()
                .post(`/api/inbound-form/${formId}/receiver/${echoReceiverId}/template/publish`)
                .set('Authorization', asOwner())
            expect(emptySubject.status).toBe(400)
        })

        it('returns the form detail with fields, security and template versions', async () => {
            const response = await http().get(`/api/inbound-form/${formId}`).set('Authorization', asOwner()).expect(200)
            const body = response.body as FormDetailBody

            expect(body.fields.map((field) => field.key).sort()).toEqual([
                'age',
                'email',
                'message',
                'name',
                'newsletter',
            ])
            expect(body.security).toEqual([expect.objectContaining({ type: 'honeypot', key: 'trap' })])
            expect(body.receivers.find((receiver) => receiver.inboundFormReceiverId === ownerReceiverId)).toMatchObject(
                { emailReplyTo: '{{email}}', draftVersion: null, publishedVersion: 2 },
            )
            expect(body.receivers.find((receiver) => receiver.inboundFormReceiverId === echoReceiverId)).toMatchObject({
                draftVersion: 2,
                publishedVersion: 1,
            })
        })
    })

    describe('project access', () => {
        it('lets a read-only member view but not change the form', async () => {
            const list = await http().get('/api/inbound-form').set('Authorization', bearer(viewerToken)).expect(200)
            expect((list.body as FormBody[]).map((form) => form.inboundFormId)).toEqual([formId])

            await http().get(`/api/inbound-form/${formId}`).set('Authorization', bearer(viewerToken)).expect(200)
            await http()
                .get(`/api/inbound-form/${formId}/receiver/${ownerReceiverId}/template`)
                .set('Authorization', bearer(viewerToken))
                .expect(200)

            const writes = [
                () => http().patch(`/api/inbound-form/${formId}`).send({ name: 'Viewer rename' }),
                () => http().delete(`/api/inbound-form/${formId}`),
                () => http().put(`/api/inbound-form/${formId}/fields`).send({ fields: [] }),
                () => http().put(`/api/inbound-form/${formId}/security`).send({ security: [] }),
                () =>
                    http()
                        .post(`/api/inbound-form/${formId}/receiver`)
                        .send({ emailFrom: 'x@forms.ifm-example.com', emailReceiver: ownerAddress }),
                () => http().patch(`/api/inbound-form/${formId}/receiver/${ownerReceiverId}`).send({ isActive: false }),
                () => http().delete(`/api/inbound-form/${formId}/receiver/${ownerReceiverId}`),
                () =>
                    http()
                        .put(`/api/inbound-form/${formId}/receiver/${ownerReceiverId}/template/draft`)
                        .send({ subject: 's', template: 't' }),
                () => http().post(`/api/inbound-form/${formId}/receiver/${ownerReceiverId}/template/publish`),
            ]
            for (const write of writes) {
                const response = await write().set('Authorization', bearer(viewerToken))
                expect(response.status).toBe(403)
            }
        })

        it('hides the form from users outside the project', async () => {
            const list = await http().get('/api/inbound-form').set('Authorization', bearer(outsiderToken)).expect(200)
            expect(list.body).toEqual([])

            await http().get(`/api/inbound-form/${formId}`).set('Authorization', bearer(outsiderToken)).expect(404)
            await http()
                .get('/api/inbound-form')
                .query({ projectId })
                .set('Authorization', bearer(outsiderToken))
                .expect(404)
            await http()
                .patch(`/api/inbound-form/${formId}`)
                .set('Authorization', bearer(outsiderToken))
                .send({ name: 'Hijacked' })
                .expect(404)
        })
    })

    describe('public submission delivery', () => {
        it('renders and delivers the published template to every active receiver', async () => {
            const response = await http()
                .post(`/api/public/form/${slug}`)
                .send({
                    data: {
                        name: 'Grace',
                        email: 'grace@ifm-submitter.test',
                        message: '<script>alert(1)</script>',
                        age: 42,
                        ignored: 'dropped',
                    },
                })
                .expect(201)
            expect(response.body).toEqual({ status: 'accepted' })

            const submission = await latestSubmission(formId)
            expect(submission?.status).toBe('accepted')
            expect(submission?.data).toEqual({
                name: 'Grace',
                email: 'grace@ifm-submitter.test',
                message: '<script>alert(1)</script>',
                age: 42,
                newsletter: false,
            })

            const [ownerMessage] = await waitForMessagesTo(mailhogUrl, ownerAddress)
            expect(header(ownerMessage!, 'From')[0]).toContain('contact@forms.ifm-example.com')
            expect(header(ownerMessage!, 'Reply-To')).toContain('grace@ifm-submitter.test')
            expect(header(ownerMessage!, 'DKIM-Signature')[0]).toContain('d=forms.ifm-example.com')
            expect(ownerMessage!.Raw.From).toBe('bounce@mail.ifm-sending.org')

            const ownerMail = await parseMessage(ownerMessage!)
            expect(ownerMail.subject).toBe('Inquiry from Grace')
            expect(ownerMail.html).toContain('<h1>New inquiry</h1>')
            expect(ownerMail.html).toContain('Grace &lt;grace@ifm-submitter.test&gt; wrote:')
            expect(ownerMail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
            expect(ownerMail.html).not.toContain('<script>')
            expect(ownerMail.html).toContain('No newsletter')

            const [echoMessage] = await waitForMessagesTo(mailhogUrl, 'grace@ifm-submitter.test')
            const echoMail = await parseMessage(echoMessage!)
            expect(echoMail.subject).toBe('Thanks Grace')
            expect(echoMail.html).toContain('We received your message, Grace.')
            expect(header(echoMessage!, 'Reply-To')).toEqual([])

            const deliveries = await deliveryModel().findAll({
                where: { inboundFormSubmissionId: submission!.inboundFormSubmissionId },
            })
            expect(deliveries.map((delivery) => delivery.emailTo).sort()).toEqual(
                ['grace@ifm-submitter.test', ownerAddress].sort(),
            )
            expect(await fetchMessagesTo(mailhogUrl, inactiveAddress)).toEqual([])
            expect(await fetchMessagesTo(mailhogUrl, unpublishedAddress)).toEqual([])
        })

        it('treats a filled query honeypot as spam', async () => {
            await http()
                .post(`/api/public/form/${slug}`)
                .query({ trap: 'gotcha' })
                .send({ data: { name: 'Bot', email: 'bot@ifm-submitter.test' } })
                .expect(201)

            const submission = await latestSubmission(formId)
            expect(submission?.status).toBe('spam')
            expect(
                await deliveryModel().count({
                    where: { inboundFormSubmissionId: submission!.inboundFormSubmissionId },
                }),
            ).toBe(0)
        })

        it('rejects data that violates field validation', async () => {
            const before = await submissionModel().count({ where: { inboundFormId: formId } })

            await http()
                .post(`/api/public/form/${slug}`)
                .send({ data: { name: 'Teen', email: 'teen@ifm-submitter.test', age: 12 } })
                .expect(400)

            expect(await submissionModel().count({ where: { inboundFormId: formId } })).toBe(before)
        })
    })

    describe('form lifecycle', () => {
        it('stops accepting submissions while the form is inactive', async () => {
            const response = await http()
                .patch(`/api/inbound-form/${formId}`)
                .set('Authorization', asOwner())
                .send({ isActive: false, name: 'IFM Contact (paused)' })
                .expect(200)
            expect(response.body).toMatchObject({ isActive: false, name: 'IFM Contact (paused)' })

            await http()
                .post(`/api/public/form/${slug}`)
                .send({ data: { name: 'Late', email: 'late@ifm-submitter.test' } })
                .expect(404)

            await http()
                .patch(`/api/inbound-form/${formId}`)
                .set('Authorization', asOwner())
                .send({ isActive: true })
                .expect(200)
        })

        it('validates form updates', async () => {
            await http()
                .patch(`/api/inbound-form/${formId}`)
                .set('Authorization', asOwner())
                .send({ domainId: null })
                .expect(400)
            await http()
                .patch(`/api/inbound-form/${formId}`)
                .set('Authorization', asOwner())
                .send({ slug: 'Invalid Slug' })
                .expect(400)
            const unknown = await http()
                .patch('/api/inbound-form/999999')
                .set('Authorization', asOwner())
                .send({ name: 'Ghost' })
            expect(unknown.status).toBe(404)
        })

        it('updates and deletes receivers', async () => {
            const paused = await http()
                .patch(`/api/inbound-form/${formId}/receiver/${echoReceiverId}`)
                .set('Authorization', asOwner())
                .send({ isActive: false })
                .expect(200)
            expect(paused.body).toMatchObject({
                emailFrom: 'noreply@forms.ifm-example.com',
                emailReceiver: '{{ email }}',
                emailReplyTo: null,
                isActive: false,
                publishedVersion: 1,
                draftVersion: 2,
            })

            const updated = await http()
                .patch(`/api/inbound-form/${formId}/receiver/${echoReceiverId}`)
                .set('Authorization', asOwner())
                .send({ emailFrom: 'thanks@forms.ifm-example.com' })
                .expect(200)
            expect(updated.body).toMatchObject({
                emailFrom: 'thanks@forms.ifm-example.com',
                emailReceiver: '{{ email }}',
                isActive: false,
            })

            await http()
                .patch(`/api/inbound-form/${formId}/receiver/${echoReceiverId}`)
                .set('Authorization', asOwner())
                .send({ emailFrom: 'spoof@other-domain.com' })
                .expect(400)

            await http()
                .delete(`/api/inbound-form/${formId}/receiver/${echoReceiverId}`)
                .set('Authorization', asOwner())
                .expect(200)
            await http()
                .get(`/api/inbound-form/${formId}/receiver/${echoReceiverId}/template`)
                .set('Authorization', asOwner())
                .expect(404)
            await http()
                .delete(`/api/inbound-form/${formId}/receiver/${echoReceiverId}`)
                .set('Authorization', asOwner())
                .expect(404)
        })

        it('rejects mass assignment of ownership columns', async () => {
            const victimProject = await http()
                .post('/api/project')
                .set('Authorization', asOwner())
                .send({ name: 'E2E Inbound Victim' })
                .expect(201)
            const victimProjectId = (victimProject.body as { projectId: number }).projectId
            const victimForm = await http()
                .post('/api/inbound-form')
                .set('Authorization', asOwner())
                .send({ name: 'Victim', slug: 'e2e-ifm-victim', domainId: null, projectId: victimProjectId })
                .expect(201)
            const victimFormId = (victimForm.body as FormBody).inboundFormId

            await http()
                .patch(`/api/inbound-form/${formId}/receiver/${ownerReceiverId}`)
                .set('Authorization', asOwner())
                .send({ isActive: true, inboundFormId: victimFormId })
                .expect(400)
            await http()
                .patch(`/api/inbound-form/${formId}`)
                .set('Authorization', asOwner())
                .send({ name: 'IFM Contact', projectId: victimProjectId })
                .expect(400)
            await http()
                .post(`/api/inbound-form/${formId}/receiver`)
                .set('Authorization', asOwner())
                .send({
                    emailFrom: 'contact@forms.ifm-example.com',
                    emailReceiver: ownerAddress,
                    inboundFormId: victimFormId,
                })
                .expect(400)

            const own = await http().get(`/api/inbound-form/${formId}`).set('Authorization', asOwner()).expect(200)
            expect((own.body as FormDetailBody).projectId).toBe(projectId)
            expect((own.body as FormDetailBody).receivers.map((receiver) => receiver.inboundFormReceiverId)).toContain(
                ownerReceiverId,
            )
            const victim = await http()
                .get(`/api/inbound-form/${victimFormId}`)
                .set('Authorization', asOwner())
                .expect(200)
            expect((victim.body as FormDetailBody).receivers).toEqual([])
        })

        it('rejects non-numeric ids with 400', async () => {
            for (const path of [
                '/api/inbound-form/abc',
                `/api/inbound-form/${formId}/receiver/abc/template`,
                '/api/inbound-form/abc/receiver/1/template',
            ]) {
                const response = await http().get(path).set('Authorization', asOwner())
                expect(response.status).toBe(400)
            }
            await http()
                .patch(`/api/inbound-form/${formId}/receiver/abc`)
                .set('Authorization', asOwner())
                .send({ isActive: true })
                .expect(400)
        })

        it('deletes the form and its public endpoint', async () => {
            await http().delete(`/api/inbound-form/${formId}`).set('Authorization', asOwner()).expect(200)

            await http().get(`/api/inbound-form/${formId}`).set('Authorization', asOwner()).expect(404)
            const submission = await http()
                .post(`/api/public/form/${slug}`)
                .send({ data: { name: 'After', email: 'after@ifm-submitter.test' } })
            expect(submission.status).toBe(404)
        })
    })

    describe('captcha protected form', () => {
        const captchaSecret = 'e2e-recaptcha-server-secret'
        let securityResponse: unknown

        const securityModel = () => app.get<typeof InboundFormSecurityModel>(getModelToken(InboundFormSecurityModel))

        async function storedRecaptcha(): Promise<InboundFormSecurityModel> {
            return (await securityModel().findOne({
                where: { inboundFormId: captchaFormId, type: 'google-recaptcha' },
            }))!
        }

        function expectNoSecretMaterial(body: unknown, encryptedSecret: string) {
            const serialized = JSON.stringify(body)
            expect(serialized).not.toContain(captchaSecret)
            expect(serialized).not.toContain(encryptedSecret)
            expect(serialized).not.toContain('encryptedSecret')
        }

        beforeAll(async () => {
            const form = await http()
                .post('/api/inbound-form')
                .set('Authorization', asOwner())
                .send({ name: 'IFM Captcha', slug: captchaSlug, domainId, projectId })
                .expect(201)
            captchaFormId = (form.body as FormBody).inboundFormId

            await http()
                .put(`/api/inbound-form/${captchaFormId}/security`)
                .set('Authorization', asOwner())
                .send({ security: [{ type: 'google-recaptcha', location: 'body', key: 'captcha' }] })
                .expect(400)

            const response = await http()
                .put(`/api/inbound-form/${captchaFormId}/security`)
                .set('Authorization', asOwner())
                .send({
                    security: [
                        { type: 'honeypot', location: 'header', key: 'X-Trap' },
                        {
                            type: 'google-recaptcha',
                            location: 'body',
                            key: 'captcha',
                            config: { secret: captchaSecret, minScore: 0.5 },
                        },
                    ],
                })
                .expect(200)
            securityResponse = response.body
        })

        it('stores the reCAPTCHA secret only as ciphertext', async () => {
            const config = (await storedRecaptcha()).config!

            expect(Object.keys(config).sort()).toEqual(['encryptedSecret', 'minScore'])
            expect(config.encryptedSecret).not.toContain(captchaSecret)
            await expect(decryptSecret(config.encryptedSecret, encryptionSecret)).resolves.toBe(captchaSecret)
        })

        it('never returns the secret or its ciphertext to owners or read-only members', async () => {
            const { encryptedSecret } = (await storedRecaptcha()).config!
            const owner = await http().get(`/api/inbound-form/${captchaFormId}`).set('Authorization', asOwner())
            const viewer = await http()
                .get(`/api/inbound-form/${captchaFormId}`)
                .set('Authorization', bearer(viewerToken))

            for (const body of [securityResponse, owner.body, viewer.body]) {
                expectNoSecretMaterial(body, encryptedSecret)
            }
            expect((viewer.body as FormDetailBody).security).toContainEqual(
                expect.objectContaining({ type: 'google-recaptcha', config: { hasSecret: true, minScore: 0.5 } }),
            )
        })

        it('keeps the stored secret when the scheme is resent without one', async () => {
            const before = (await storedRecaptcha()).config!

            const response = await http()
                .put(`/api/inbound-form/${captchaFormId}/security`)
                .set('Authorization', asOwner())
                .send({
                    security: [
                        { type: 'honeypot', location: 'header', key: 'X-Trap' },
                        { type: 'google-recaptcha', location: 'body', key: 'captcha', config: { minScore: 0.6 } },
                    ],
                })
                .expect(200)

            const after = (await storedRecaptcha()).config!
            expect(after).toEqual({ encryptedSecret: before.encryptedSecret, minScore: 0.6 })
            await expect(decryptSecret(after.encryptedSecret, encryptionSecret)).resolves.toBe(captchaSecret)
            expectNoSecretMaterial(response.body, after.encryptedSecret)
        })

        it('rejects a submission without a captcha token', async () => {
            const response = await http().post(`/api/public/form/${captchaSlug}`).send({ data: {} })

            expect(response.status).toBe(403)
            expect(await latestSubmission(captchaFormId)).toBeNull()
        })

        it('classifies a header honeypot hit as spam before checking the captcha', async () => {
            await http().post(`/api/public/form/${captchaSlug}`).set('X-Trap', 'filled').send({ data: {} }).expect(201)

            expect((await latestSubmission(captchaFormId))?.status).toBe('spam')
        })

        it('requires a secret again once the reCAPTCHA scheme was removed', async () => {
            await http()
                .put(`/api/inbound-form/${captchaFormId}/security`)
                .set('Authorization', asOwner())
                .send({ security: [] })
                .expect(200)

            const response = await http()
                .put(`/api/inbound-form/${captchaFormId}/security`)
                .set('Authorization', asOwner())
                .send({ security: [{ type: 'google-recaptcha', location: 'body', key: 'captcha' }] })

            expect(response.status).toBe(400)
            expect((response.body as { message: string }).message).toBe('Recaptcha requires a secret')
            expect(await securityModel().count({ where: { inboundFormId: captchaFormId } })).toBe(0)
        })
    })

    describe('rate limiting', () => {
        it('throttles excessive public submissions', async () => {
            const statuses: number[] = []
            for (let attempt = 0; attempt < 12; attempt++) {
                const response = await http().post('/api/public/form/e2e-ifm-unknown').send({ data: {} })
                statuses.push(response.status)
            }

            expect(statuses).toContain(429)
            expect(statuses.slice(statuses.indexOf(429)).every((status) => status === 429)).toBe(true)
        })
    })
})
