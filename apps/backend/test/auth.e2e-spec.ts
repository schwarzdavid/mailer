import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import { LOGIN_THROTTLE_LIMIT } from '../src/modules/auth/auth.constants.js'

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

    it.each([
        ['a missing password', { email: 'auth.user@example.com' }],
        ['an empty password', { email: 'auth.user@example.com', password: '' }],
        ['a malformed email', { email: 'not-an-email', password: 'whatever' }],
        ['a non-string password', { email: 'auth.user@example.com', password: 12345 }],
        ['unknown properties', { email: 'auth.user@example.com', password: 'whatever', role: 'super_admin' }],
    ])('rejects a login body with %s with 400', async (_case, body) => {
        const response = await http().post('/api/auth/login').send(body)

        expect(response.status).toBe(400)
    })

    it('throttles repeated login attempts against one account without locking out others', async () => {
        const target = { email: 'auth.bruteforce@example.com', password: 'guess' }
        const statuses: number[] = []
        for (let attempt = 0; attempt < LOGIN_THROTTLE_LIMIT + 2; attempt++) {
            const response = await http().post('/api/auth/login').send(target)
            statuses.push(response.status)
        }

        expect(statuses.slice(0, LOGIN_THROTTLE_LIMIT).every((status) => status === 401)).toBe(true)
        expect(statuses.slice(LOGIN_THROTTLE_LIMIT).every((status) => status === 429)).toBe(true)

        await http().post('/api/auth/login').send(credentials).expect(200)
    })
})
