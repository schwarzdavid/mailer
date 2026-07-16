import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app'
import { login, seedUser, type Credentials } from './support/session'
import { DomainModel } from '../src/modules/domain/models/domain.model'
import { SettingsModel } from '../src/modules/settings/models/settings.model'
import { DomainDnsRecordDto } from '../src/modules/domain/dtos/domain-dns-record.dto'
import { DomainDnsRecordUse } from '../src/modules/domain/interfaces/domain-dns.interface'

describe('SettingsController (e2e)', () => {
    let app: INestApplication<App>
    let token: string

    const credentials: Credentials = {
        email: 'settings.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    beforeAll(async () => {
        app = await createTestApp()
        await app.get<typeof SettingsModel>(getModelToken(SettingsModel)).destroy({ where: {} })
        await app.get<typeof DomainModel>(getModelToken(DomainModel)).destroy({ where: {} })
        await seedUser(app, credentials)
        token = await login(app, credentials)
    })

    afterAll(async () => {
        await app?.close()
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

        const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
        await expect(domainModel.findOne({ where: { fqdn: 'customer-early.org' } })).resolves.toBeNull()
    })

    it('configures the sending domain and returns the full record set', async () => {
        const response = await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'mail.sending-e2e.org', serverIpv4: '203.0.113.10' })
            .expect(200)
        const body = response.body as { fqdn: string; records: DomainDnsRecordDto[] }

        expect(body.fqdn).toBe('mail.sending-e2e.org')
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

        expect(created.dns.spf.value).toBe('v=spf1 include:mail.sending-e2e.org ~all')

        const listResponse = await http().get('/api/domain').set('Authorization', `Bearer ${token}`).expect(200)
        const fqdns = (listResponse.body as { fqdn: string }[]).map((domain) => domain.fqdn)

        expect(fqdns).toContain('customer-e2e.org')
        expect(fqdns).not.toContain('mail.sending-e2e.org')
    })

    it('swaps the sending domain and rewrites customer SPF values', async () => {
        await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'mail.sending-e2e-two.org', serverIpv4: '203.0.113.11' })
            .expect(200)

        const settingsResponse = await http().get('/api/settings').set('Authorization', `Bearer ${token}`).expect(200)
        const settings = settingsResponse.body as { sendingDomain: { fqdn: string } }
        expect(settings.sendingDomain.fqdn).toBe('mail.sending-e2e-two.org')

        const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
        await expect(domainModel.findOne({ where: { fqdn: 'mail.sending-e2e.org' } })).resolves.toBeNull()

        const listResponse = await http().get('/api/domain').set('Authorization', `Bearer ${token}`).expect(200)
        const customer = (listResponse.body as { fqdn: string; dns: { spf: DomainDnsRecordDto } }[]).find(
            (domain) => domain.fqdn === 'customer-e2e.org',
        )
        expect(customer?.dns.spf.value).toBe('v=spf1 include:mail.sending-e2e-two.org ~all')
    })

    it('refreshes the sending domain records on demand', async () => {
        const response = await http()
            .post('/api/settings/sending-domain/refresh')
            .set('Authorization', `Bearer ${token}`)
            .expect(201)
        const body = response.body as { lastCheckedAt: string | null }

        expect(body.lastCheckedAt).not.toBeNull()
    })

    it('renames the sending domain within the same root domain keeping the server ip', async () => {
        const response = await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'smtp.sending-e2e-two.org', serverIpv4: '203.0.113.11' })
            .expect(200)
        const body = response.body as { fqdn: string; records: DomainDnsRecordDto[] }

        expect(body.fqdn).toBe('smtp.sending-e2e-two.org')
        const ptr = body.records.find((record) => record.use === DomainDnsRecordUse.PTR)
        expect(ptr?.host).toBe('203.0.113.11')

        const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
        await expect(domainModel.findOne({ where: { fqdn: 'mail.sending-e2e-two.org' } })).resolves.toBeNull()
    })

    it('swaps the sending domain to a new root while keeping the server ip', async () => {
        const response = await http()
            .put('/api/settings/sending-domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'mail.sending-e2e-three.org', serverIpv4: '203.0.113.11' })
            .expect(200)
        const body = response.body as { fqdn: string; records: DomainDnsRecordDto[] }

        expect(body.fqdn).toBe('mail.sending-e2e-three.org')

        const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
        await expect(domainModel.findOne({ where: { fqdn: 'smtp.sending-e2e-two.org' } })).resolves.toBeNull()
    })
})
