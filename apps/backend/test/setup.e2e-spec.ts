import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app'
import { UserModel } from '../src/modules/user/models/user.model'

describe('SetupController (e2e)', () => {
    let app: INestApplication<App>

    const registration = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'setup.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    beforeAll(async () => {
        app = await createTestApp()
        const userModel = app.get<typeof UserModel>(getModelToken(UserModel))
        await userModel.destroy({ where: {} })
    })

    afterAll(async () => {
        await app?.close()
    })

    it('reports that setup is needed while no user exists', async () => {
        const response = await http().get('/api/setup/status').expect(200)

        expect(response.body).toEqual({ needsSetup: true })
    })

    it('registers the first user and returns a usable token', async () => {
        const response = await http().post('/api/setup/user').send(registration).expect(200)
        const body = response.body as { token: string; user: { email: string; password?: string } }

        expect(body.token.length).toBeGreaterThan(0)
        expect(body.user).toMatchObject({ email: registration.email })
        expect(body.user.password).toBeUndefined()

        await http().get('/api/auth/user').set('Authorization', `Bearer ${body.token}`).expect(200)
    })

    it('reports that setup is completed afterwards', async () => {
        const response = await http().get('/api/setup/status').expect(200)

        expect(response.body).toEqual({ needsSetup: false })
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
})
