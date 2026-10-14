import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { configureSendingDomain } from './support/sending-domain.js'
import { DomainModel } from '../src/modules/domain/models/domain.model.js'
import { DomainDkimModel } from '../src/modules/domain/models/domain-dkim.model.js'
import { DomainDnsModel } from '../src/modules/domain/models/domain-dns.model.js'

describe('DomainController (e2e)', () => {
    let app: INestApplication<App>
    let token: string

    const credentials: Credentials = {
        email: 'domain.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, credentials)
        token = await login(app, credentials)
        await configureSendingDomain(app, token)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('creates a domain with an active, encrypted DKIM key', async () => {
        const fqdn = 'example.com'

        const response = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn })
            .expect(201)
        const body = response.body as { domainId: number; fqdn: string }

        expect(body).toMatchObject({ fqdn })
        expect(typeof body.domainId).toBe('number')

        // The domain row really landed in Postgres...
        const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
        const domain = await domainModel.findOne({ where: { fqdn } })
        expect(domain).not.toBeNull()

        // ...alongside a committed, activated DKIM key (proves the transaction fix).
        const dkimModel = app.get<typeof DomainDkimModel>(getModelToken(DomainDkimModel))
        const dkim = await dkimModel.findOne({ where: { domainId: domain!.domainId } })
        expect(dkim).not.toBeNull()
        expect(domain!.activeDkimId).toBe(dkim!.dkimId)
        expect(dkim!.selector).toBe('s1')
        expect(dkim!.algorithm).toBe('rsa')
        expect(dkim!.keyBits).toBe(2048)
        expect(dkim!.publicKey).toContain('BEGIN PUBLIC KEY')
        // The stored private key is an encrypted envelope, never raw PEM.
        expect(dkim!.privateKey.startsWith('v1.')).toBe(true)
        expect(dkim!.privateKey).not.toContain('BEGIN PRIVATE KEY')
    })

    it('rejects domain creation without a token', async () => {
        const response = await http().post('/api/domain').send({ fqdn: 'no-auth.example.com' })

        expect(response.status).toBe(401)
    })

    it('rejects an invalid fqdn with 400', async () => {
        const response = await http()
            .post('/api/domain')
            .set('Authorization', `Bearer ${token}`)
            .send({ fqdn: 'not a valid domain' })

        expect(response.status).toBe(400)
    })

    it('lists, reads and refreshes a domain with its dns records', async () => {
        const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
        const { domainId } = await domainModel.findOne({ where: { fqdn: 'example.com' }, rejectOnEmpty: true })

        const list = await http().get('/api/domain').set('Authorization', `Bearer ${token}`).expect(200)
        expect((list.body as { domainId: number }[]).map((domain) => domain.domainId)).toContain(domainId)

        const detail = await http().get(`/api/domain/${domainId}`).set('Authorization', `Bearer ${token}`).expect(200)
        const body = detail.body as { fqdn: string; dns: Record<string, { host: string; value: string }> }
        expect(body.fqdn).toBe('example.com')
        expect(body.dns.spf).toMatchObject({ host: 'example.com', value: 'v=spf1 include:mail.sending-e2e.org ~all' })
        expect(body.dns.dkim).toMatchObject({ host: 's1._domainkey.example.com' })
        expect(body.dns.dkim!.value).toMatch(/^v=DKIM1; k=rsa; p=/)

        const refreshed = await http()
            .post(`/api/domain/${domainId}/refresh`)
            .set('Authorization', `Bearer ${token}`)
            .expect(201)
        expect(refreshed.body).toMatchObject({ domainId, fqdn: 'example.com' })
        const checked = await domainModel.findByPk(domainId, { rejectOnEmpty: true })
        expect(checked.lastCheckedAt).toBeInstanceOf(Date)
    })

    it.each([
        ['get', '/api/domain'],
        ['get', '/api/domain/1'],
        ['post', '/api/domain/1/refresh'],
        ['delete', '/api/domain/1'],
    ] as const)('rejects %s %s without a token', async (method, path) => {
        const response = await http()[method](path)

        expect(response.status).toBe(401)
    })

    it('denies every domain route to a user without domain grants', async () => {
        const memberCredentials: Credentials = {
            email: 'domain.member@example.com',
            password: 'correct-horse-battery-staple',
        }
        await seedUser(app, memberCredentials, 'user')
        const memberToken = await login(app, memberCredentials)

        for (const call of [
            () => http().get('/api/domain'),
            () => http().get('/api/domain/1'),
            () => http().post('/api/domain/1/refresh'),
            () => http().delete('/api/domain/1'),
            () => http().post('/api/domain').send({ fqdn: 'member.example.com' }),
        ]) {
            const response = await call().set('Authorization', `Bearer ${memberToken}`)
            expect(response.status).toBe(403)
        }
    })

    describe('error mapping', () => {
        it('answers an unknown domain with 404 on read and refresh', async () => {
            const read = await http().get('/api/domain/999999').set('Authorization', `Bearer ${token}`)
            const refresh = await http().post('/api/domain/999999/refresh').set('Authorization', `Bearer ${token}`)

            expect(read.status).toBe(404)
            expect(refresh.status).toBe(404)
        })

        it.each([
            ['get', '/api/domain/abc'],
            ['post', '/api/domain/abc/refresh'],
            ['delete', '/api/domain/abc'],
        ] as const)('rejects %s %s with a non-numeric id with 400', async (method, path) => {
            const response = await http()[method](path).set('Authorization', `Bearer ${token}`)

            expect(response.status).toBe(400)
        })

        it('rejects a second domain under the same root domain with 409 and leaves no orphan', async () => {
            const response = await http()
                .post('/api/domain')
                .set('Authorization', `Bearer ${token}`)
                .send({ fqdn: 'www.example.com' })

            expect(response.status).toBe(409)
            const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
            expect(await domainModel.findOne({ where: { fqdn: 'www.example.com' } })).toBeNull()
        })

        it('rejects properties the create endpoint does not accept', async () => {
            const response = await http()
                .post('/api/domain')
                .set('Authorization', `Bearer ${token}`)
                .send({ fqdn: 'extra-props.example.org', activeDkimId: 1 })

            expect(response.status).toBe(400)
        })
    })

    describe('DELETE /domain/:domainId', () => {
        const createDomain = async (fqdn: string): Promise<number> => {
            const response = await http()
                .post('/api/domain')
                .set('Authorization', `Bearer ${token}`)
                .send({ fqdn })
                .expect(201)
            return (response.body as { domainId: number }).domainId
        }

        it('deletes a domain only held by a deleted project together with its records, keys and assignments', async () => {
            const domainId = await createDomain('delete-me.org')
            const project = await http()
                .post('/api/project')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Domain delete e2e' })
                .expect(201)
            const projectId = (project.body as { projectId: number }).projectId
            await http()
                .post(`/api/project/${projectId}/domains`)
                .set('Authorization', `Bearer ${token}`)
                .send({ domainId })
                .expect(201)

            const assigned = await http().delete(`/api/domain/${domainId}`).set('Authorization', `Bearer ${token}`)
            expect(assigned.status).toBe(409)

            await http().delete(`/api/project/${projectId}`).set('Authorization', `Bearer ${token}`).expect(200)
            await http().delete(`/api/domain/${domainId}`).set('Authorization', `Bearer ${token}`).expect(200)
            await http().post(`/api/project/${projectId}/restore`).set('Authorization', `Bearer ${token}`).expect(201)

            await http().get(`/api/domain/${domainId}`).set('Authorization', `Bearer ${token}`).expect(404)
            const dnsModel = app.get<typeof DomainDnsModel>(getModelToken(DomainDnsModel))
            expect(await dnsModel.count({ where: { domainId } })).toBe(0)
            const dkimModel = app.get<typeof DomainDkimModel>(getModelToken(DomainDkimModel))
            expect(await dkimModel.count({ where: { domainId }, paranoid: false })).toBe(0)
            const detail = await http()
                .get(`/api/project/${projectId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
            expect((detail.body as { domains: unknown[] }).domains).toEqual([])

            await createDomain('delete-me.org')
        })

        it('answers an unknown domain with 404', async () => {
            const response = await http().delete('/api/domain/999999').set('Authorization', `Bearer ${token}`)

            expect(response.status).toBe(404)
        })

        it('refuses to delete the configured sending domain with 409', async () => {
            const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
            const sendingDomain = await domainModel.findOne({
                where: { fqdn: 'mail.sending-e2e.org' },
                rejectOnEmpty: true,
            })

            await http()
                .delete(`/api/domain/${sendingDomain.domainId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(409)
            expect(await domainModel.findByPk(sendingDomain.domainId)).not.toBeNull()
        })

        it('refuses to delete a domain that inbound forms use with 409', async () => {
            const domainId = await createDomain('form-domain-delete.org')
            const project = await http()
                .post('/api/project')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Domain in use e2e' })
                .expect(201)
            const projectId = (project.body as { projectId: number }).projectId
            await http()
                .post(`/api/project/${projectId}/domains`)
                .set('Authorization', `Bearer ${token}`)
                .send({ domainId })
                .expect(201)
            await http()
                .post('/api/inbound-form')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Uses domain', slug: 'e2e-domain-delete-in-use', domainId, projectId })
                .expect(201)

            const response = await http().delete(`/api/domain/${domainId}`).set('Authorization', `Bearer ${token}`)

            expect(response.status).toBe(409)
            const domainModel = app.get<typeof DomainModel>(getModelToken(DomainModel))
            expect(await domainModel.findByPk(domainId)).not.toBeNull()
        })
    })
})
