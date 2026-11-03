import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { UserModel } from '../src/modules/user/models/user.model.js'
import { SettingsModel } from '../src/modules/settings/models/settings.model.js'
import { DomainModel } from '../src/modules/domain/models/domain.model.js'
import { configureSendingDomain } from './support/sending-domain.js'
import { login, seedUser } from './support/session.js'
import { SetupTokenService } from '../src/modules/setup/services/setup-token.service.js'

describe('SetupController (e2e)', () => {
    let app: INestApplication<App>
    let userModel: typeof UserModel
    let token: string
    let registration: {
        firstName: string
        lastName: string
        email: string
        password: string
        setupToken: string
    }

    const http = () => request(app.getHttpServer())

    beforeAll(async () => {
        app = await createTestApp()
        await app.get<typeof SettingsModel>(getModelToken(SettingsModel)).destroy({ where: {} })
        await app.get<typeof DomainModel>(getModelToken(DomainModel)).destroy({ where: {} })
        userModel = app.get<typeof UserModel>(getModelToken(UserModel))
        await userModel.destroy({ where: {} })
        registration = {
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'setup.user@example.com',
            password: 'correct-horse-battery-staple',
            setupToken: app.get(SetupTokenService).token,
        }
    })

    afterAll(async () => {
        await app?.close()
    })

    it('reports that setup is needed while no user exists', async () => {
        const response = await http().get('/api/setup/status').expect(200)

        expect(response.body).toEqual({ needsSetup: true, step: 'account' })
    })

    it('refuses to finish the setup without a token', async () => {
        const response = await http().post('/api/setup/finish')

        expect(response.status).toBe(401)
    })

    it('refuses registration with a wrong setup token and creates no user', async () => {
        await http()
            .post('/api/setup/user')
            .send({ ...registration, setupToken: 'x'.repeat(32) })
            .expect(403)
        expect(await userModel.count()).toBe(0)
    })

    it('refuses registration without a setup token', async () => {
        const withoutToken = { ...registration, setupToken: undefined }

        const response = await http().post('/api/setup/user').send(withoutToken)

        expect(response.status).toBe(400)
    })

    it('registers the first user and returns a usable token', async () => {
        const response = await http().post('/api/setup/user').send(registration).expect(200)
        const body = response.body as { token: string; user: { email: string; password?: string } }

        expect(body.token.length).toBeGreaterThan(0)
        expect(body.user).toMatchObject({ email: registration.email })
        expect(body.user.password).toBeUndefined()

        await http().get('/api/auth/user').set('Authorization', `Bearer ${body.token}`).expect(200)
        token = body.token
    })

    it('asks for the sending domain once the account exists', async () => {
        const response = await http().get('/api/setup/status').expect(200)

        expect(response.body).toEqual({ needsSetup: true, step: 'sendingDomain' })
    })

    it('refuses to finish the setup before a sending domain is configured', async () => {
        const response = await http().post('/api/setup/finish').set('Authorization', `Bearer ${token}`)

        expect(response.status).toBe(409)
    })

    it('shows the records step once the sending domain is configured', async () => {
        await configureSendingDomain(app, token)

        const response = await http().get('/api/setup/status').expect(200)

        expect(response.body).toEqual({ needsSetup: true, step: 'records' })
    })

    it('only lets settings editors finish the setup', async () => {
        const credentials = { email: 'setup.plain@example.com', password: 'correct-horse-battery-staple' }
        await seedUser(app, credentials, 'user')
        const plainToken = await login(app, credentials)

        const response = await http().post('/api/setup/finish').set('Authorization', `Bearer ${plainToken}`)

        expect(response.status).toBe(403)
        await http().get('/api/setup/status').expect(200, { needsSetup: true, step: 'records' })
    })

    it('finishes the setup durably and idempotently', async () => {
        const finished = await http().post('/api/setup/finish').set('Authorization', `Bearer ${token}`).expect(200)
        expect(finished.body).toEqual({ needsSetup: false, step: 'finished' })

        const settingsModel = app.get<typeof SettingsModel>(getModelToken(SettingsModel))
        const finishedAt = (await settingsModel.findOne())?.setupFinishedAt
        expect(finishedAt).toBeInstanceOf(Date)

        await http().post('/api/setup/finish').set('Authorization', `Bearer ${token}`).expect(200)
        expect((await settingsModel.findOne())?.setupFinishedAt).toEqual(finishedAt)
    })

    it('reports that setup is completed afterwards', async () => {
        const response = await http().get('/api/setup/status').expect(200)

        expect(response.body).toEqual({ needsSetup: false, step: 'finished' })
    })

    it('refuses a second registration with 403', async () => {
        const response = await http()
            .post('/api/setup/user')
            .send({ ...registration, email: 'second.user@example.com' })

        expect(response.status).toBe(403)
    })

    it('rejects an invalid registration body with 400', async () => {
        const response = await http().post('/api/setup/user').send({ firstName: 'Ada' })

        expect(response.status).toBe(400)
    })

    it.each([
        ['an empty first name', () => ({ ...registration, email: 'empty.name@example.com', firstName: '' })],
        ['unknown properties', () => ({ ...registration, email: 'extra.prop@example.com', roleId: 1 })],
    ])('rejects a registration with %s with 400', async (_case, buildBody) => {
        const response = await http().post('/api/setup/user').send(buildBody())

        expect(response.status).toBe(400)
    })

    it('never throttles the status probe the frontend sends on every navigation', async () => {
        const statuses: number[] = []
        for (let attempt = 0; attempt < 25; attempt++) {
            statuses.push((await http().get('/api/setup/status')).status)
        }

        expect(statuses.every((status) => status === 200)).toBe(true)
    })

    it('throttles repeated registration attempts', async () => {
        const statuses: number[] = []
        for (let attempt = 0; attempt < 12; attempt++) {
            statuses.push((await http().post('/api/setup/user').send({ firstName: 'Ada' })).status)
        }

        expect(statuses).toContain(429)
        expect(statuses.slice(statuses.indexOf(429)).every((status) => status === 429)).toBe(true)
    })
})
