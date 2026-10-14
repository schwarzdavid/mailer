import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { UserModel } from '../src/modules/user/models/user.model.js'

describe('Email normalization (e2e)', () => {
    let app: INestApplication<App>
    let token: string
    let userId: number

    const adminCredentials: Credentials = {
        email: 'Normalize.Admin@Example.com',
        password: 'correct-horse-battery-staple',
    }
    const password = 'correct-horse-battery-staple'

    const http = () => request(app.getHttpServer())
    const asAdmin = () => `Bearer ${token}`

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, adminCredentials)
        token = await login(app, { ...adminCredentials, email: 'normalize.admin@example.com' })
    })

    afterAll(async () => {
        await app?.close()
    })

    it('stores a created user email lowercased', async () => {
        const response = await http()
            .post('/api/user')
            .set('Authorization', asAdmin())
            .send({ firstName: 'Mixed', lastName: 'Case', email: 'Mixed.Case@Example.COM', password })
            .expect(201)

        const body = response.body as { userId: number; email: string }
        userId = body.userId
        expect(body.email).toBe('mixed.case@example.com')
    })

    it('logs in regardless of the email casing', async () => {
        await expect(login(app, { email: 'MIXED.CASE@example.com', password })).resolves.toEqual(expect.any(String))
        await expect(login(app, { email: 'mixed.case@example.com', password })).resolves.toEqual(expect.any(String))
    })

    it('rejects an email that differs from an existing one only by case', async () => {
        const response = await http()
            .post('/api/user')
            .set('Authorization', asAdmin())
            .send({ firstName: 'Dup', lastName: 'Licate', email: 'mixed.CASE@example.com', password })

        expect(response.status).toBe(400)
    })

    it('stores an updated email lowercased and rejects case-only collisions', async () => {
        const updated = await http()
            .patch(`/api/user/${userId}`)
            .set('Authorization', asAdmin())
            .send({ email: 'Renamed.User@Example.com' })
            .expect(200)
        expect((updated.body as { email: string }).email).toBe('renamed.user@example.com')

        await http()
            .patch(`/api/user/${userId}`)
            .set('Authorization', asAdmin())
            .send({ email: 'NORMALIZE.ADMIN@example.com' })
            .expect(400)
    })

    it('refuses to persist a non-normalized email at the database level', async () => {
        const userModel = app.get<typeof UserModel>(getModelToken(UserModel))

        await expect(userModel.update({ email: 'Renamed.User@Example.com' }, { where: { userId } })).rejects.toThrow(
            /users_email_normalized/,
        )
    })
})
