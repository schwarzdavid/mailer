import { INestApplication } from '@nestjs/common'
import type { Redis } from 'ioredis'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetThrottleCounters } from './support/throttle-counters.js'
import { THROTTLER_REDIS_CLIENT } from '../src/modules/throttler-storage/throttler-storage.constants.js'
import { LOGIN_THROTTLE_BLOCK_MS, LOGIN_THROTTLE_LIMIT } from '../src/modules/auth/auth.constants.js'
import { SetupTokenService } from '../src/modules/setup/services/setup-token.service.js'

const PUBLIC_FORM_LIMIT = 10
const FORM_BUDGET = 5

describe('Rate limiting (e2e)', () => {
    let appA: INestApplication<App>
    let appB: INestApplication<App>

    beforeAll(async () => {
        process.env.TRUST_PROXY = ''
        const { createTestApp } = await import('./support/app.js')
        appA = await createTestApp()
        appB = await createTestApp()
    })

    afterAll(async () => {
        await appA.close()
        await appB.close()
    })

    function submitForm(app: INestApplication<App>, forwardedFor: string, slug = 'rate-limit-unknown-form') {
        return request(app.getHttpServer())
            .post(`/api/public/form/${slug}`)
            .set('X-Forwarded-For', forwardedFor)
            .send({ data: {} })
    }

    function attemptLogin(app: INestApplication<App>, email: string) {
        return request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'wrong-password' })
    }

    it('ignores X-Forwarded-For without TRUST_PROXY, so spoofed addresses cannot escape the limit', async () => {
        const statuses: number[] = []
        for (let attempt = 1; attempt <= PUBLIC_FORM_LIMIT + 1; attempt++) {
            const response = await submitForm(appA, `198.51.100.${attempt}`, `rate-limit-unknown-form-${attempt}`)
            statuses.push(response.status)
        }

        expect(statuses.slice(0, PUBLIC_FORM_LIMIT)).not.toContain(429)
        expect(statuses[PUBLIC_FORM_LIMIT]).toBe(429)
    })

    it('counts hits from every instance against one shared budget', async () => {
        const email = `rate-limit-shared-${Date.now()}@example.com`

        const first = await attemptLogin(appA, email).expect(401)
        const second = await attemptLogin(appB, email).expect(401)

        expect(first.headers['x-ratelimit-remaining']).toBe(String(LOGIN_THROTTLE_LIMIT - 1))
        expect(second.headers['x-ratelimit-remaining']).toBe(String(LOGIN_THROTTLE_LIMIT - 2))
    })

    it('blocks a login budget exhausted on one instance on every other instance for the block duration', async () => {
        const email = `rate-limit-exhausted-${Date.now()}@example.com`

        for (let attempt = 0; attempt < LOGIN_THROTTLE_LIMIT; attempt++) {
            await attemptLogin(appA, email).expect(401)
        }

        const blocked = await attemptLogin(appB, email).expect(429)
        const retryAfter = Number(blocked.headers['retry-after'])

        expect(retryAfter).toBeGreaterThan(LOGIN_THROTTLE_BLOCK_MS / 1000 - 10)
        expect(retryAfter).toBeLessThanOrEqual(LOGIN_THROTTLE_BLOCK_MS / 1000)
        await attemptLogin(appA, email).expect(429)
    })

    it('keeps budgets for other emails from the same address independent', async () => {
        const response = await attemptLogin(appB, `rate-limit-other-${Date.now()}@example.com`).expect(401)

        expect(response.headers['x-ratelimit-remaining']).toBe(String(LOGIN_THROTTLE_LIMIT - 1))
    })

    describe('inbound form budgets per ip and slug', () => {
        beforeEach(async () => {
            await resetThrottleCounters()
        })

        function requestToken(slug: string) {
            return request(appA.getHttpServer()).post(`/api/public/form/${slug}/token`)
        }

        it('limits token requests per slug and keeps other slugs independent', async () => {
            for (let attempt = 0; attempt < FORM_BUDGET; attempt++) {
                const response = await requestToken('rate-limit-token-a')
                expect(response.status).not.toBe(429)
            }

            await requestToken('rate-limit-token-a').expect(429)
            const other = await requestToken('rate-limit-token-b')
            expect(other.status).not.toBe(429)
        })

        it('limits submissions per slug and keeps other slugs independent', async () => {
            for (let attempt = 0; attempt < FORM_BUDGET; attempt++) {
                const response = await submitForm(appA, '198.51.100.1', 'rate-limit-submit-a')
                expect(response.status).not.toBe(429)
            }

            await submitForm(appA, '198.51.100.1', 'rate-limit-submit-a').expect(429)
            const other = await submitForm(appA, '198.51.100.1', 'rate-limit-submit-b')
            expect(other.status).not.toBe(429)
        })

        it('does not throttle the client script with the form budgets', async () => {
            for (let attempt = 0; attempt < FORM_BUDGET + 1; attempt++) {
                await request(appA.getHttpServer()).get('/api/public/form/client.js').expect(200)
            }
        })
    })
})

describe('Rate limiting when Redis is unavailable (e2e)', () => {
    let app: INestApplication<App>

    let validRegistration: {
        firstName: string
        lastName: string
        email: string
        password: string
        setupToken: string
    }

    const http = () => request(app.getHttpServer())

    beforeAll(async () => {
        process.env.TRUST_PROXY = ''
        const { createTestApp } = await import('./support/app.js')
        app = await createTestApp()
        validRegistration = {
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'rate-limit-outage@example.com',
            password: 'correct-horse-battery-staple',
            setupToken: app.get(SetupTokenService).token,
        }
        app.get<Redis>(THROTTLER_REDIS_CLIENT).disconnect()
    })

    afterAll(async () => {
        await app.close()
    })

    it('refuses logins with 503 instead of skipping the limit', async () => {
        const response = await http()
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'whatever-password' })

        expect(response.status).toBe(503)
    })

    it('refuses first-user registration with 503', async () => {
        const response = await http().post('/api/setup/user').send(validRegistration)

        expect(response.status).toBe(503)
    })

    it('keeps public form routes available', async () => {
        const response = await http().post('/api/public/form/unknown-slug').send({ data: {} })

        expect(response.status).toBe(404)
    })
})
