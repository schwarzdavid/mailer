import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app'
import { login, seedUser, type Credentials } from './support/session'

describe('AuthController (e2e)', () => {
    let app: INestApplication<App>

    const credentials: Credentials = {
        email: 'auth.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, credentials)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('issues a JWT and returns the user for valid credentials', async () => {
        const response = await http().post('/api/auth/login').send(credentials).expect(200)
        const body = response.body as { token: string; user: { email: string; password?: string } }

        expect(typeof body.token).toBe('string')
        expect(body.token.length).toBeGreaterThan(0)
        expect(body.user).toMatchObject({ email: credentials.email })
        expect(body.user.password).toBeUndefined()
    })

    it('rejects invalid credentials with 401', async () => {
        const response = await http()
            .post('/api/auth/login')
            .send({ email: credentials.email, password: 'wrong-password' })

        expect(response.status).toBe(401)
    })

    it('returns the current user for a valid token', async () => {
        const token = await login(app, credentials)

        const response = await http().get('/api/auth/user').set('Authorization', `Bearer ${token}`).expect(200)

        expect(response.body as { email: string }).toMatchObject({ email: credentials.email })
    })

    it('rejects the current-user endpoint without a token', async () => {
        const response = await http().get('/api/auth/user')

        expect(response.status).toBe(401)
    })

    it('rejects the current-user endpoint with a malformed token', async () => {
        const response = await http().get('/api/auth/user').set('Authorization', 'Bearer not-a-real-token')

        expect(response.status).toBe(401)
    })
})
