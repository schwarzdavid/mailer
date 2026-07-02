import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app'
import { login, seedUser, type Credentials } from './support/session'
import { DomainModel } from '../src/modules/domain/models/domain.model'
import { DomainDkimModel } from '../src/modules/domain/models/domain-dkim.model'

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
})
