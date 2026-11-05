import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { login, seedUser, type Credentials } from './support/session.js'
import { ensureSendingDomain } from './support/sending-domain.js'
import { resetThrottleCounters } from './support/throttle-counters.js'
import { DomainDnsModel } from '../src/modules/domain/models/domain-dns.model.js'
import { DomainDnsRecordStatus } from '../src/modules/domain/interfaces/domain-dns.interface.js'
import { DnsHealthService } from '../src/modules/domain/services/dns-health.service.js'
import { MailMessageModel } from '../src/modules/mail/models/mail-message.model.js'
import { InboundFormSubmissionModel } from '../src/modules/inbound-form/models/inbound-form-submission.model.js'
import { InboundFormDeliveryModel } from '../src/modules/inbound-form/models/inbound-form-delivery.model.js'
import { InboundFormDeliveryService } from '../src/modules/inbound-form/services/inbound-form-delivery.service.js'
import { InboundFormDeliveryProcessor } from '../src/modules/inbound-form/processors/inbound-form-delivery.processor.js'
import { InboundFormDeliveryStatus } from '../src/modules/inbound-form/interfaces/inbound-form-delivery.interface.js'

describe('Send gate SEND_REQUIRE_VALID_DNS (e2e)', () => {
    let app: INestApplication<App>
    let token: string
    let projectId: number
    let sendDomainId: number
    let formDomainId: number
    let key: string
    let previousSetting: string | undefined
    let startupDnsCheck: MockInstance<DnsHealthService['checkAllDomains']> | undefined

    const credentials: Credentials = {
        email: 'send-gate-e2e.owner@example.com',
        password: 'correct-horse-battery-staple',
    }
    const sendFrom = 'news@send.gate-example.com'
    const formSlug = 'send-gate-contact'

    const http = () => request(app.getHttpServer())
    const asOwner = () => `Bearer ${token}`
    const send = () =>
        http()
            .post('/api/v1/send')
            .set('Authorization', `Bearer ${key}`)
            .send({ from: sendFrom, to: 'reader@example.org', subject: 'Gate', html: '<p>Gate</p>' })

    const dnsModel = () => app.get<typeof DomainDnsModel>(getModelToken(DomainDnsModel))
    const markRecordsValid = (domainId: number) =>
        dnsModel().update({ status: DomainDnsRecordStatus.VALID, issue: null }, { where: { domainId } })

    async function createAssignedDomain(fqdn: string): Promise<number> {
        const domain = await http().post('/api/domain').set('Authorization', asOwner()).send({ fqdn }).expect(201)
        const domainId = (domain.body as { domainId: number }).domainId
        await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', asOwner())
            .send({ domainId })
            .expect(201)
        return domainId
    }

    async function createPublishedForm(domainId: number): Promise<number> {
        const form = await http()
            .post('/api/inbound-form')
            .set('Authorization', asOwner())
            .send({ name: 'Send Gate Contact', slug: formSlug, domainId, projectId })
            .expect(201)
        const inboundFormId = (form.body as { inboundFormId: number }).inboundFormId
        const receiver = await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver`)
            .set('Authorization', asOwner())
            .send({ emailFrom: 'noreply@forms.gate-forms.org', emailReceiver: 'owner@business.com' })
            .expect(201)
        const templatePath = `/api/inbound-form/${inboundFormId}/receiver/${(receiver.body as { inboundFormReceiverId: number }).inboundFormReceiverId}/template`
        await http()
            .put(`${templatePath}/draft`)
            .set('Authorization', asOwner())
            .send({ subject: 'Gate submission', template: '<p>Someone wrote in.</p>' })
            .expect(200)
        await http().post(`${templatePath}/publish`).set('Authorization', asOwner()).expect(201)
        return inboundFormId
    }

    beforeAll(async () => {
        previousSetting = process.env.SEND_REQUIRE_VALID_DNS
        process.env.SEND_REQUIRE_VALID_DNS = 'true'
        startupDnsCheck = vi.spyOn(DnsHealthService.prototype, 'checkAllDomains').mockResolvedValue(undefined)
        const { createTestApp } = await import('./support/app.js')
        app = await createTestApp()
        await vi.waitFor(() => {
            if (startupDnsCheck?.mock.calls.length !== 1) {
                throw new Error('The startup DNS check has not run yet')
            }
        })
        await app.get(InboundFormDeliveryProcessor).worker.close()

        await seedUser(app, credentials)
        token = await login(app, credentials)
        await ensureSendingDomain(app)

        const project = await http()
            .post('/api/project')
            .set('Authorization', asOwner())
            .send({ name: 'E2E Send Gate' })
            .expect(201)
        projectId = (project.body as { projectId: number }).projectId
        sendDomainId = await createAssignedDomain('send.gate-example.com')
        formDomainId = await createAssignedDomain('forms.gate-forms.org')

        const created = await http()
            .post(`/api/project/${projectId}/api-keys`)
            .set('Authorization', asOwner())
            .send({ name: 'Send Gate' })
            .expect(201)
        key = (created.body as { key: string }).key
    })

    beforeEach(async () => {
        await resetThrottleCounters()
    })

    afterAll(async () => {
        await app?.close()
        startupDnsCheck?.mockRestore()
        if (previousSetting === undefined) {
            delete process.env.SEND_REQUIRE_VALID_DNS
        } else {
            process.env.SEND_REQUIRE_VALID_DNS = previousSetting
        }
    })

    it('refuses an api send from a domain whose dns records are not valid and logs no message', async () => {
        const messageModel = app.get<typeof MailMessageModel>(getModelToken(MailMessageModel))
        const messagesBefore = await messageModel.count({ where: { projectId } })

        const response = await send().expect(422)

        expect(response.body).toMatchObject({
            code: 'FROM_DOMAIN_NOT_READY',
            message: 'The from domain has DNS records that are not valid yet',
        })
        await expect(messageModel.count({ where: { projectId } })).resolves.toBe(messagesBefore)
    })

    it('accepts the same send once every record of the domain is valid', async () => {
        await markRecordsValid(sendDomainId)

        const response = await send().expect(202)

        expect((response.body as { status: string }).status).toBe('sent')
    })

    it('keeps a form delivery pending until the domain records are valid, then sends it', async () => {
        await createPublishedForm(formDomainId)
        await http().post(`/api/public/form/${formSlug}`).send({ data: {} }).expect(201)

        const submissionModel = app.get<typeof InboundFormSubmissionModel>(getModelToken(InboundFormSubmissionModel))
        const deliveryModel = app.get<typeof InboundFormDeliveryModel>(getModelToken(InboundFormDeliveryModel))
        const submission = await submissionModel.findOne({
            where: { status: 'accepted' },
            include: [{ association: 'inboundForm', where: { slug: formSlug } }],
            rejectOnEmpty: true,
        })
        const delivery = await deliveryModel.findOne({
            where: { inboundFormSubmissionId: submission.inboundFormSubmissionId },
            rejectOnEmpty: true,
        })
        const deliveryService = app.get(InboundFormDeliveryService)

        await expect(deliveryService.deliver(delivery.inboundFormDeliveryId, false)).rejects.toThrow(
            `Domain ${formDomainId} (forms.gate-forms.org) has DNS records that are not valid yet`,
        )
        await delivery.reload()
        expect(delivery.status).toBe(InboundFormDeliveryStatus.PENDING)
        expect(delivery.attempts).toBe(1)
        expect(delivery.error).toBe(
            `Domain ${formDomainId} (forms.gate-forms.org) has DNS records that are not valid yet`,
        )

        await markRecordsValid(formDomainId)
        await deliveryService.deliver(delivery.inboundFormDeliveryId, false)

        await delivery.reload()
        expect(delivery.status).toBe(InboundFormDeliveryStatus.SENT)
        expect(delivery.attempts).toBe(2)
        expect(delivery.error).toBeNull()
    })
})
