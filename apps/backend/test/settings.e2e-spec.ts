import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { E2E_MAIL_HOSTNAME } from './support/sending-domain.js'
import { DomainModel } from '../src/modules/domain/models/domain.model.js'
import { SettingsModel } from '../src/modules/settings/models/settings.model.js'
import { SettingsService } from '../src/modules/settings/services/settings.service.js'
import { DomainDnsRecordDto } from '../src/modules/domain/dtos/domain-dns-record.dto.js'
import { DomainDnsRecordUse } from '../src/modules/domain/interfaces/domain-dns.interface.js'

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

    async function markSendingDomainStale(): Promise<void> {
        const settings = await settingsModel().findOne({ rejectOnEmpty: true })
        await domainModel().update(
            { fqdn: 'mail.stale-sending.org', rootDomain: 'stale-sending.org' },
            { where: { domainId: settings.sendingDomainId! } },
        )
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

    it('proposes MAIL_HOSTNAME and tolerates missing address records', async () => {
        const response = await http()
            .get('/api/settings/sending-domain/proposal')
            .set('Authorization', `Bearer ${token}`)
            .expect(200)

        expect(response.body).toEqual({ fqdn: E2E_MAIL_HOSTNAME, serverIpv4: null, serverIpv6: null })
    })

    it('rejects customer domain creation while no sending domain is configured', async () => {
        const response = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'customer-early.org' })

        expect(response.status).toBe(400)
        await expect(domainModel().findOne({ where: { fqdn: 'customer-early.org' } })).resolves.toBeNull()
    })

    it('no longer accepts a domain name in the configuration', async () => {
        const response = await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'mail.other-sending.org', serverIpv4: '203.0.113.10' })

        expect(response.status).toBe(400)
        await expect(domainModel().findOne({ where: { fqdn: 'mail.other-sending.org' } })).resolves.toBeNull()
    })

    it('configures MAIL_HOSTNAME as the sending domain and returns the full record set', async () => {
        const response = await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ serverIpv4: '203.0.113.10' })
            .expect(200)
        const body = response.body as { fqdn: string; records: DomainDnsRecordDto[] }

        expect(body.fqdn).toBe(E2E_MAIL_HOSTNAME)
        const uses = body.records.map((record) => record.use).sort()
        expect(uses).toEqual(['a', 'dkim', 'dmarc', 'mx', 'ptr', 'spf'])
        const spf = body.records.find((record) => record.use === DomainDnsRecordUse.SPF)
        expect(spf?.value).toBe('v=spf1 ip4:203.0.113.10 -all')
        const ptr = body.records.find((record) => record.use === DomainDnsRecordUse.PTR)
        expect(ptr?.host).toBe('203.0.113.10')
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

    it('changes the server addresses while keeping the domain', async () => {
        const before = await domainModel().findOne({ where: { fqdn: E2E_MAIL_HOSTNAME }, rejectOnEmpty: true })

        const response = await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ serverIpv4: '203.0.113.11', serverIpv6: '2001:db8::11' })
            .expect(200)
        const body = response.body as { fqdn: string; serverIpv6: string | null; records: DomainDnsRecordDto[] }

        expect(body.fqdn).toBe(E2E_MAIL_HOSTNAME)
        expect(body.serverIpv6).toBe('2001:db8::11')
        const spf = body.records.find((record) => record.use === DomainDnsRecordUse.SPF)
        expect(spf?.value).toBe('v=spf1 ip4:203.0.113.11 ip6:2001:db8::11 -all')
        const after = await domainModel().findOne({ where: { fqdn: E2E_MAIL_HOSTNAME }, rejectOnEmpty: true })
        expect(after.domainId).toBe(before.domainId)
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
        expect(settings.sendingDomain).toMatchObject({ fqdn: E2E_MAIL_HOSTNAME, serverIpv4: '203.0.113.11' })
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
})
