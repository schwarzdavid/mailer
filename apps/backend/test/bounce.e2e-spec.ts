import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { createTransport } from 'nodemailer'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { configureSendingDomain } from './support/sending-domain.js'
import { fetchMessagesTo, header, waitForMessagesTo } from './support/mailhog.js'
import { BounceMailboxService } from '../src/modules/bounce/services/bounce-mailbox.service.js'
import { InboundFormDeliveryModel } from '../src/modules/inbound-form/models/inbound-form-delivery.model.js'
import { DAY_MS } from '../src/modules/bounce/bounce.constants.js'

interface BounceBody {
    bounceId: number
    emailAddress: string
    type: 'permanent' | 'transient'
    statusCode: string | null
    reason: string
    receivedAt: string
    messageId?: string
}

interface EmailBlockBody {
    emailBlockId: number
    emailAddress: string
    blockCount: number
    blockedUntil: string | null
}

interface DsnRecipient {
    address: string
    action: 'failed' | 'delayed'
    status: string
    diagnostic?: string
}

function dsnSource(messageId: string, recipient: DsnRecipient): string {
    return [
        'From: MAILER-DAEMON@relay.bounce-e2e.test',
        `To: ${inject('e2eEnv').IMAP_USER}`,
        'Subject: Undelivered Mail Returned to Sender',
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: ${messageId}`,
        'MIME-Version: 1.0',
        'Content-Type: multipart/report; report-type=delivery-status; boundary="BOUND"',
        '',
        '--BOUND',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'This is the mail system at host relay.bounce-e2e.test.',
        '',
        '--BOUND',
        'Content-Type: message/delivery-status',
        '',
        'Reporting-MTA: dns; relay.bounce-e2e.test',
        '',
        `Final-Recipient: rfc822; ${recipient.address}`,
        `Action: ${recipient.action}`,
        `Status: ${recipient.status}`,
        ...(recipient.diagnostic ? [`Diagnostic-Code: smtp; ${recipient.diagnostic}`] : []),
        '',
        '--BOUND--',
        '',
    ].join('\r\n')
}

describe('Bounce (e2e)', () => {
    let app: INestApplication<App>
    let superToken: string
    let readerToken: string
    let memberToken: string
    let inboundFormId: number

    const env = inject('e2eEnv')
    const slug = 'e2e-bounce-contact'
    const permanentAddress = 'gone@bounce-e2e.test'
    const transientAddress = 'busy@bounce-e2e.test'
    const password = 'correct-horse-battery-staple'
    const superCredentials: Credentials = { email: 'bounce-e2e.super@example.com', password }
    const readerCredentials: Credentials = { email: 'bounce-e2e.reader@example.com', password }
    const memberCredentials: Credentials = { email: 'bounce-e2e.member@example.com', password }

    const http = () => request(app.getHttpServer())
    const bearer = (token: string) => `Bearer ${token}`

    const greenmail = createTransport({
        host: env.GREENMAIL_SMTP_HOST,
        port: Number(env.GREENMAIL_SMTP_PORT),
        secure: false,
        ignoreTLS: true,
    })

    async function injectMail(raw: string): Promise<void> {
        await greenmail.sendMail({
            envelope: { from: 'mailer-daemon@relay.bounce-e2e.test', to: env.IMAP_USER },
            raw,
        })
    }

    async function getBounces(address: string): Promise<BounceBody[]> {
        const response = await http().get('/api/bounce').set('Authorization', bearer(superToken)).expect(200)
        return (response.body as BounceBody[]).filter((bounce) => bounce.emailAddress === address)
    }

    async function getBlock(address: string): Promise<EmailBlockBody | undefined> {
        const response = await http().get('/api/bounce/blocked').set('Authorization', bearer(superToken)).expect(200)
        return (response.body as EmailBlockBody[]).find((block) => block.emailAddress === address)
    }

    async function pollUntil(assertion: () => Promise<void>): Promise<void> {
        await vi.waitFor(
            async () => {
                await app.get(BounceMailboxService).pollRound()
                await assertion()
            },
            { timeout: 20_000, interval: 500 },
        )
    }

    async function submitForm(): Promise<void> {
        await http()
            .post(`/api/public/form/${slug}`)
            .send({ data: { message: 'Hello there' } })
            .expect(201)
    }

    async function latestDeliveryTo(address: string): Promise<InboundFormDeliveryModel> {
        const deliveryModel = app.get<typeof InboundFormDeliveryModel>(getModelToken(InboundFormDeliveryModel))
        return await vi.waitFor(
            async () => {
                const delivery = await deliveryModel.findOne({
                    where: { emailTo: address },
                    order: [['inboundFormDeliveryId', 'DESC']],
                })
                expect(delivery?.status).toMatch(/^(sent|failed)$/)
                return delivery!
            },
            { timeout: 15_000 },
        )
    }

    function expectBlockedForDays(block: EmailBlockBody | undefined, days: number): void {
        expect(block?.blockedUntil).not.toBeNull()
        const remaining = new Date(block!.blockedUntil!).getTime() - Date.now()
        expect(remaining).toBeGreaterThan((days - 1) * DAY_MS)
        expect(remaining).toBeLessThanOrEqual(days * DAY_MS)
    }

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, superCredentials)
        await seedUser(app, readerCredentials, 'user')
        await seedUser(app, memberCredentials, 'user')
        superToken = await login(app, superCredentials)
        readerToken = await login(app, readerCredentials)
        memberToken = await login(app, memberCredentials)
        await configureSendingDomain(app, superToken, 'mail.bounce-sending.org')

        const users = await http().get('/api/user').set('Authorization', bearer(superToken)).expect(200)
        const reader = (users.body as { userId: number; email: string }[]).find(
            (user) => user.email === readerCredentials.email,
        )!
        await http()
            .put(`/api/user/${reader.userId}/permissions`)
            .set('Authorization', bearer(superToken))
            .send({ permissions: ['bounces.read'] })
            .expect(200)

        const domain = await http()
            .post('/api/domain')
            .set('Authorization', bearer(superToken))
            .send({ fqdn: 'forms.bounce-e2e.com' })
            .expect(201)
        const domainId = (domain.body as { domainId: number }).domainId

        const project = await http()
            .post('/api/project')
            .set('Authorization', bearer(superToken))
            .send({ name: 'E2E Bounce' })
            .expect(201)
        const projectId = (project.body as { projectId: number }).projectId

        await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', bearer(superToken))
            .send({ domainId })
            .expect(201)

        const form = await http()
            .post('/api/inbound-form')
            .set('Authorization', bearer(superToken))
            .send({ name: 'E2E Bounce Contact', slug, domainId, projectId })
            .expect(201)
        inboundFormId = (form.body as { inboundFormId: number }).inboundFormId

        await http()
            .put(`/api/inbound-form/${inboundFormId}/fields`)
            .set('Authorization', bearer(superToken))
            .send({ fields: [{ key: 'message', label: 'Message', type: 'text', validation: { required: true } }] })
            .expect(200)

        const receiver = await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver`)
            .set('Authorization', bearer(superToken))
            .send({ emailFrom: 'noreply@forms.bounce-e2e.com', emailReceiver: permanentAddress })
            .expect(201)
        const receiverId = (receiver.body as { inboundFormReceiverId: number }).inboundFormReceiverId

        await http()
            .put(`/api/inbound-form/${inboundFormId}/receiver/${receiverId}/template/draft`)
            .set('Authorization', bearer(superToken))
            .send({ subject: 'Bounce check', template: '<p>{{message}}</p>' })
            .expect(200)
        await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver/${receiverId}/template/publish`)
            .set('Authorization', bearer(superToken))
            .expect(201)
    })

    afterAll(async () => {
        greenmail.close()
        await app?.close()
    })

    describe('access control', () => {
        it.each([
            ['get', '/api/bounce'],
            ['get', '/api/bounce/blocked'],
            ['delete', '/api/bounce/blocked/1'],
        ] as const)('rejects %s %s without a token', async (method, path) => {
            const response = await http()[method](path)

            expect(response.status).toBe(401)
        })

        it.each([
            ['get', '/api/bounce'],
            ['get', '/api/bounce/blocked'],
            ['delete', '/api/bounce/blocked/1'],
        ] as const)('denies %s %s to a plain user', async (method, path) => {
            const response = await http()[method](path).set('Authorization', bearer(memberToken))

            expect(response.status).toBe(403)
        })

        it('lets bounces.read list but not unblock', async () => {
            await http().get('/api/bounce').set('Authorization', bearer(readerToken)).expect(200)
            await http().get('/api/bounce/blocked').set('Authorization', bearer(readerToken)).expect(200)
            const unblock = await http().delete('/api/bounce/blocked/1').set('Authorization', bearer(readerToken))
            expect(unblock.status).toBe(403)
        })
    })

    describe('delivery before any bounce', () => {
        it('sends to the receiver with the bounce envelope sender', async () => {
            await submitForm()

            const delivery = await latestDeliveryTo(permanentAddress)
            expect(delivery.status).toBe('sent')

            const [message] = await waitForMessagesTo(env.MAILHOG_URL, permanentAddress)
            expect(message!.Raw.From).toBe('bounce@mail.bounce-sending.org')
            expect(header(message!, 'From')[0]).toContain('noreply@forms.bounce-e2e.com')
        })
    })

    describe('mailbox ingestion', () => {
        it('records a permanent DSN from the bounce mailbox and blocks the address', async () => {
            await injectMail(
                dsnSource(`<${randomUUID()}@relay.bounce-e2e.test>`, {
                    address: permanentAddress.toUpperCase(),
                    action: 'failed',
                    status: '5.1.1',
                    diagnostic: `550 5.1.1 <${permanentAddress}>: User unknown`,
                }),
            )

            await pollUntil(async () => {
                expect(await getBounces(permanentAddress)).toHaveLength(1)
            })

            const [bounce] = await getBounces(permanentAddress)
            expect(bounce).toMatchObject({
                emailAddress: permanentAddress,
                type: 'permanent',
                statusCode: '5.1.1',
                reason: `550 5.1.1 <${permanentAddress}>: User unknown`,
            })
            expect(bounce!.messageId).toBeUndefined()

            const block = await getBlock(permanentAddress)
            expect(block?.blockCount).toBe(1)
            expectBlockedForDays(block, 7)
        })

        it('does not record the same DSN twice', async () => {
            const messageId = `<${randomUUID()}@relay.bounce-e2e.test>`
            const recipient: DsnRecipient = { address: 'dup@bounce-e2e.test', action: 'failed', status: '5.2.1' }

            await injectMail(dsnSource(messageId, recipient))
            await pollUntil(async () => {
                expect(await getBounces('dup@bounce-e2e.test')).toHaveLength(1)
            })

            await injectMail(dsnSource(messageId, recipient))
            await app.get(BounceMailboxService).pollRound()
            await app.get(BounceMailboxService).pollRound()

            expect(await getBounces('dup@bounce-e2e.test')).toHaveLength(1)
            expect((await getBlock('dup@bounce-e2e.test'))?.blockCount).toBe(1)
        })

        it('ignores mailbox messages that are not delivery reports', async () => {
            const countBounces = async () =>
                (
                    (await http().get('/api/bounce').set('Authorization', bearer(superToken)).expect(200))
                        .body as BounceBody[]
                ).length
            const before = await countBounces()

            await injectMail(
                [
                    'From: someone@elsewhere.test',
                    `To: ${env.IMAP_USER}`,
                    'Subject: Out of office',
                    `Message-ID: <${randomUUID()}@elsewhere.test>`,
                    '',
                    'I am away until Monday. Contact busy@bounce-e2e.test meanwhile.',
                    '',
                ].join('\r\n'),
            )
            await app.get(BounceMailboxService).pollRound()

            expect(await countBounces()).toBe(before)
            expect(await getBounces(transientAddress)).toEqual([])
        })

        it('blocks only after repeated transient bounces', async () => {
            const blockedAfterAttempt: boolean[] = []
            for (let attempt = 1; attempt <= 3; attempt++) {
                await injectMail(
                    dsnSource(`<${randomUUID()}@relay.bounce-e2e.test>`, {
                        address: transientAddress,
                        action: attempt === 3 ? 'failed' : 'delayed',
                        status: '4.2.2',
                        diagnostic: '452 4.2.2 Mailbox full',
                    }),
                )
                await pollUntil(async () => {
                    expect(await getBounces(transientAddress)).toHaveLength(attempt)
                })

                blockedAfterAttempt.push((await getBlock(transientAddress)) !== undefined)
            }

            expect(blockedAfterAttempt).toEqual([false, false, true])
            const bounces = await getBounces(transientAddress)
            expect(bounces.every((bounce) => bounce.type === 'transient')).toBe(true)
            expectBlockedForDays(await getBlock(transientAddress), 7)
        })
    })

    describe('sending to a blocked address', () => {
        it('accepts the submission but fails the delivery without sending', async () => {
            const sentBefore = (await fetchMessagesTo(env.MAILHOG_URL, permanentAddress)).length

            await submitForm()

            const delivery = await latestDeliveryTo(permanentAddress)
            expect(delivery.status).toBe('failed')
            expect(delivery.error).toContain(`Recipient ${permanentAddress} is blocked until`)
            expect(delivery.sentAt).toBeNull()
            expect(await fetchMessagesTo(env.MAILHOG_URL, permanentAddress)).toHaveLength(sentBefore)
        })
    })

    describe('DELETE /bounce/blocked/:emailBlockId', () => {
        it('unblocks the address so delivery resumes', async () => {
            const block = await getBlock(permanentAddress)
            const sentBefore = (await fetchMessagesTo(env.MAILHOG_URL, permanentAddress)).length

            const response = await http()
                .delete(`/api/bounce/blocked/${block!.emailBlockId}`)
                .set('Authorization', bearer(superToken))
                .expect(200)
            expect(response.body).toEqual({
                emailBlockId: block!.emailBlockId,
                emailAddress: permanentAddress,
                blockCount: 1,
                blockedUntil: null,
            })
            expect(await getBlock(permanentAddress)).toBeUndefined()

            await submitForm()

            const delivery = await latestDeliveryTo(permanentAddress)
            expect(delivery.status).toBe('sent')
            await waitForMessagesTo(env.MAILHOG_URL, permanentAddress, sentBefore + 1)
        })

        it('escalates the block duration when the address bounces again', async () => {
            await injectMail(
                dsnSource(`<${randomUUID()}@relay.bounce-e2e.test>`, {
                    address: permanentAddress,
                    action: 'failed',
                    status: '5.1.1',
                }),
            )

            await pollUntil(async () => {
                expect(await getBounces(permanentAddress)).toHaveLength(2)
            })

            const block = await getBlock(permanentAddress)
            expect(block?.blockCount).toBe(2)
            expectBlockedForDays(block, 30)
        })

        it('answers an unknown block with 404', async () => {
            const response = await http().delete('/api/bounce/blocked/999999').set('Authorization', bearer(superToken))

            expect(response.status).toBe(404)
        })
    })
})
