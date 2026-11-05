import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { E2E_MAIL_HOSTNAME, E2E_SERVER_IPV4, ensureSendingDomain } from './support/sending-domain.js'
import { DomainModel } from '../src/modules/domain/models/domain.model.js'
import { DomainDnsModel } from '../src/modules/domain/models/domain-dns.model.js'
import { SettingsModel } from '../src/modules/settings/models/settings.model.js'
import { SettingsService } from '../src/modules/settings/services/settings.service.js'
import { DomainDnsRecordDto } from '../src/modules/domain/dtos/domain-dns-record.dto.js'
import { DomainDnsRecordStatus, DomainDnsRecordUse } from '../src/modules/domain/interfaces/domain-dns.interface.js'

interface SendingDomainBody {
    fqdn: string
    serverIpv4: string
    serverIpv6: string | null
    records: DomainDnsRecordDto[]
}

describe('SettingsController (e2e)', () => {
    let app: INestApplication<App>
    let token: string

    const credentials: Credentials = {
        email: 'settings.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())
    const domainModel = () => app.get<typeof DomainModel>(getModelToken(DomainModel))
    const settingsModel = () => app.get<typeof SettingsModel>(getModelToken(SettingsModel))
    const dnsModel = () => app.get<typeof DomainDnsModel>(getModelToken(DomainDnsModel))

    async function markSendingDomainStale(
        fqdn = 'mail.stale-sending.org',
        rootDomain = 'stale-sending.org',
    ): Promise<void> {
        const settings = await settingsModel().findOne({ rejectOnEmpty: true })
        await domainModel().update({ fqdn, rootDomain }, { where: { domainId: settings.sendingDomainId! } })
    }

    beforeAll(async () => {
        app = await createTestApp()
        await settingsModel().destroy({ where: {} })
        await domainModel().destroy({ where: {} })
        await seedUser(app, credentials)
        token = await login(app, credentials)
    })

    afterAll(async () => {
        if (app) {
            await settingsModel().destroy({ where: {} })
            await domainModel().destroy({ where: {} })
            await app.close()
        }
    })

    it('rejects unauthenticated access', async () => {
        const response = await http().get('/api/settings')

        expect(response.status).toBe(401)
    })

    it('returns no sending domain before configuration', async () => {
        const response = await http().get('/api/settings').set('Authorization', `Bearer ${token}`).expect(200)

        expect(response.body).toEqual({ sendingDomain: null })
    })

    it('rejects customer domain creation while no sending domain is configured', async () => {
        const response = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'customer-early.org' })

        expect(response.status).toBe(400)
        await expect(domainModel().findOne({ where: { fqdn: 'customer-early.org' } })).resolves.toBeNull()
    })

    it('no longer offers the configuration endpoints', async () => {
        await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ serverIpv4: '203.0.113.10' })
            .expect(404)
        await http().get('/api/settings/sending-domain/proposal').set('Authorization', `Bearer ${token}`).expect(404)
        await expect(settingsModel().count()).resolves.toBe(0)
    })

    it('creates MAIL_HOSTNAME as the sending domain from MAIL_SERVER_IPV4', async () => {
        await ensureSendingDomain(app)

        const response = await http().get('/api/settings').set('Authorization', `Bearer ${token}`).expect(200)
        const body = (response.body as { sendingDomain: SendingDomainBody }).sendingDomain

        expect(body).toMatchObject({ fqdn: E2E_MAIL_HOSTNAME, serverIpv4: E2E_SERVER_IPV4, serverIpv6: null })
        const uses = body.records.map((record) => record.use).sort()
        expect(uses).toEqual(['a', 'dkim', 'dmarc', 'mx', 'ptr', 'spf'])
        const spf = body.records.find((record) => record.use === DomainDnsRecordUse.SPF)
        expect(spf?.value).toBe(`v=spf1 ip4:${E2E_SERVER_IPV4} -all`)
        expect(spf?.priority).toBeNull()
        const mx = body.records.find((record) => record.use === DomainDnsRecordUse.MX)
        expect(mx).toMatchObject({ value: E2E_MAIL_HOSTNAME, priority: 10 })
        const ptr = body.records.find((record) => record.use === DomainDnsRecordUse.PTR)
        expect(ptr?.host).toBe(E2E_SERVER_IPV4)
    })

    it('generates customer SPF records against the sending domain and hides it from the list', async () => {
        const createResponse = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'customer-e2e.org' })
            .expect(201)
        const created = createResponse.body as { dns: { spf: DomainDnsRecordDto } }

        expect(created.dns.spf.value).toBe(`v=spf1 include:${E2E_MAIL_HOSTNAME} ~all`)

        const listResponse = await http().get('/api/domain').set('Authorization', `Bearer ${token}`).expect(200)
        const fqdns = (listResponse.body as { fqdn: string }[]).map((domain) => domain.fqdn)

        expect(fqdns).toContain('customer-e2e.org')
        expect(fqdns).not.toContain(E2E_MAIL_HOSTNAME)
    })

    it('regenerates the records when the stored addresses differ from the configuration', async () => {
        const before = await domainModel().findOne({ where: { fqdn: E2E_MAIL_HOSTNAME }, rejectOnEmpty: true })
        const customer = await domainModel().findOne({ where: { fqdn: 'customer-e2e.org' }, rejectOnEmpty: true })
        const publishedSpf = `v=spf1 include:${E2E_MAIL_HOSTNAME} ~all`
        await dnsModel().update(
            { status: DomainDnsRecordStatus.VALID, current: publishedSpf, issue: null },
            { where: { domainId: customer.domainId, use: DomainDnsRecordUse.SPF } },
        )
        await dnsModel().update(
            { value: '203.0.113.99' },
            { where: { domainId: before.domainId, use: DomainDnsRecordUse.A } },
        )
        await dnsModel().update(
            { value: 'v=spf1 ip4:203.0.113.99 -all' },
            { where: { domainId: before.domainId, use: DomainDnsRecordUse.SPF } },
        )

        await ensureSendingDomain(app)

        const sendingRecords = await dnsModel().findAll({ where: { domainId: before.domainId } })
        const valueOf = (use: DomainDnsRecordUse) => sendingRecords.find((record) => record.use === use)?.value
        expect(valueOf(DomainDnsRecordUse.A)).toBe(E2E_SERVER_IPV4)
        expect(valueOf(DomainDnsRecordUse.SPF)).toBe(`v=spf1 ip4:${E2E_SERVER_IPV4} -all`)
        const after = await domainModel().findOne({ where: { fqdn: E2E_MAIL_HOSTNAME }, rejectOnEmpty: true })
        expect(after.domainId).toBe(before.domainId)
        expect(after.activeDkimId).toBe(before.activeDkimId)
        const customerSpf = await dnsModel().findOne({
            where: { domainId: customer.domainId, use: DomainDnsRecordUse.SPF },
            rejectOnEmpty: true,
        })
        expect(customerSpf).toMatchObject({ status: DomainDnsRecordStatus.VALID, current: publishedSpf, issue: null })
    })

    it('keeps the records on a restart with unchanged configuration', async () => {
        const sendingDomain = await domainModel().findOne({ where: { fqdn: E2E_MAIL_HOSTNAME }, rejectOnEmpty: true })
        await dnsModel().update(
            { status: DomainDnsRecordStatus.VALID, issue: null },
            { where: { domainId: sendingDomain.domainId } },
        )
        const before = await dnsModel().findAll({
            where: { domainId: sendingDomain.domainId },
            order: [['dnsId', 'ASC']],
        })

        const restarted = await createTestApp()
        await app.close()
        app = restarted

        const after = await dnsModel().findAll({
            where: { domainId: sendingDomain.domainId },
            order: [['dnsId', 'ASC']],
        })
        expect(after.map((record) => [record.dnsId, record.status])).toEqual(
            before.map((record) => [record.dnsId, DomainDnsRecordStatus.VALID]),
        )
    })

    it('refreshes the sending domain records on demand', async () => {
        const response = await http()
            .post('/api/settings/sending-domain/refresh')
            .set('Authorization', `Bearer ${token}`)
            .expect(201)
        const body = response.body as { lastCheckedAt: string | null }

        expect(body.lastCheckedAt).not.toBeNull()
    })

    it('switches a stale sending domain to MAIL_HOSTNAME on startup and rewrites customer SPF values', async () => {
        await markSendingDomainStale()

        const restarted = await createTestApp()
        await app.close()
        app = restarted

        const settingsResponse = await http().get('/api/settings').set('Authorization', `Bearer ${token}`).expect(200)
        const settings = settingsResponse.body as { sendingDomain: { fqdn: string; serverIpv4: string } }
        expect(settings.sendingDomain).toMatchObject({ fqdn: E2E_MAIL_HOSTNAME, serverIpv4: E2E_SERVER_IPV4 })
        await expect(domainModel().findOne({ where: { fqdn: 'mail.stale-sending.org' } })).resolves.toBeNull()

        const listResponse = await http().get('/api/domain').set('Authorization', `Bearer ${token}`).expect(200)
        const customer = (listResponse.body as { fqdn: string; dns: { spf: DomainDnsRecordDto } }[]).find(
            (domain) => domain.fqdn === 'customer-e2e.org',
        )
        expect(customer?.dns.spf.value).toBe(`v=spf1 include:${E2E_MAIL_HOSTNAME} ~all`)
    })

    it('refuses to switch while MAIL_HOSTNAME is registered as a customer domain', async () => {
        await markSendingDomainStale()
        await domainModel().create({ fqdn: E2E_MAIL_HOSTNAME, rootDomain: 'sending-e2e.org' })

        await expect(app.get(SettingsService).reconcileSendingDomain()).rejects.toThrow(
            /registered as a customer domain/,
        )

        await expect(domainModel().findOne({ where: { fqdn: 'mail.stale-sending.org' } })).resolves.not.toBeNull()
    })

    it('refuses to switch while a customer domain shares the registrable domain of MAIL_HOSTNAME', async () => {
        await domainModel().destroy({ where: { fqdn: E2E_MAIL_HOSTNAME } })
        await markSendingDomainStale()
        await domainModel().create({ fqdn: 'shop.sending-e2e.org', rootDomain: 'sending-e2e.org' })

        await expect(app.get(SettingsService).reconcileSendingDomain()).rejects.toThrow(
            /shares the registrable domain sending-e2e\.org with the customer domain shop\.sending-e2e\.org/,
        )

        await expect(domainModel().findOne({ where: { fqdn: 'mail.stale-sending.org' } })).resolves.not.toBeNull()
        await expect(domainModel().findOne({ where: { fqdn: E2E_MAIL_HOSTNAME } })).resolves.toBeNull()
    })

    it('switches to MAIL_HOSTNAME from a stale sending domain under the same registrable domain', async () => {
        await domainModel().destroy({ where: { fqdn: 'shop.sending-e2e.org' } })
        await markSendingDomainStale('old.sending-e2e.org', 'sending-e2e.org')

        await expect(app.get(SettingsService).reconcileSendingDomain()).resolves.toBeUndefined()

        const settings = await settingsModel().findOne({ rejectOnEmpty: true })
        const sendingDomain = await domainModel().findByPk(settings.sendingDomainId!, { rejectOnEmpty: true })
        expect(sendingDomain).toMatchObject({ fqdn: E2E_MAIL_HOSTNAME, rootDomain: 'sending-e2e.org' })
        await expect(domainModel().findOne({ where: { fqdn: 'old.sending-e2e.org' } })).resolves.toBeNull()
    })
})
