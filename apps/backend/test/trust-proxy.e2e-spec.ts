import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PUBLIC_FORM_LIMIT = 10

describe('TRUST_PROXY (e2e)', () => {
    let app: INestApplication<App>

    beforeAll(async () => {
        process.env.TRUST_PROXY = 'loopback'
        const { createTestApp } = await import('./support/app.js')
        app = await createTestApp()
    })

    afterAll(async () => {
        await app.close()
    })

    function submitForm(forwardedFor: string, slug = 'trust-proxy-unknown-form') {
        return request(app.getHttpServer())
            .post(`/api/public/form/${slug}`)
            .set('X-Forwarded-For', forwardedFor)
            .send({ data: {} })
    }

    it('gives each forwarded client its own throttle bucket', async () => {
        const statuses: number[] = []
        for (let attempt = 0; attempt <= PUBLIC_FORM_LIMIT; attempt++) {
            const response = await submitForm('203.0.113.10', `trust-proxy-unknown-form-${attempt}`)
            statuses.push(response.status)
        }

        expect(statuses.slice(0, PUBLIC_FORM_LIMIT)).not.toContain(429)
        expect(statuses[PUBLIC_FORM_LIMIT]).toBe(429)

        const otherClient = await submitForm('203.0.113.20')

        expect(otherClient.status).not.toBe(429)
        expect(otherClient.headers['x-ratelimit-remaining']).toBe(String(PUBLIC_FORM_LIMIT - 1))
    })

    it('keys on the client address, not the address of the trusted proxy', async () => {
        const response = await submitForm('203.0.113.30, 127.0.0.1')

        expect(response.headers['x-ratelimit-remaining']).toBe(String(PUBLIC_FORM_LIMIT - 1))
    })
})
