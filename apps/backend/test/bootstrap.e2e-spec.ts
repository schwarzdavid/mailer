import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { createTestApp } from './support/app.js'

describe('application bootstrap (shared configureApp)', () => {
    let app: INestApplication<App>

    beforeAll(async () => {
        app = await createTestApp()
    })

    afterAll(async () => {
        await app?.close()
    })

    it('serves the API under the /api prefix only', async () => {
        await request(app.getHttpServer()).get('/api/setup/status').expect(200)
        await request(app.getHttpServer()).get('/setup/status').expect(404)
    })

    it('answers the site origin with CORS headers', async () => {
        await request(app.getHttpServer())
            .get('/api/setup/status')
            .set('Origin', 'https://app.e2e.test')
            .expect('Access-Control-Allow-Origin', 'https://app.e2e.test')
            .expect(200)
    })

    it('gives foreign origins no CORS headers on the admin API', async () => {
        const response = await request(app.getHttpServer())
            .get('/api/setup/status')
            .set('Origin', 'https://evil.example')
        expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('answers a public form preflight from any origin and echoes the requested headers', async () => {
        const response = await request(app.getHttpServer())
            .options('/api/public/form/contact')
            .set('Origin', 'https://kunde.example')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'content-type,x-form-check')
            .expect(204)
        expect(response.headers['access-control-allow-origin']).toBe('*')
        expect(response.headers['access-control-allow-headers']).toBe('content-type,x-form-check')
    })

    it('lets other sites load the form client script', async () => {
        await request(app.getHttpServer())
            .get('/api/public/form/client.js')
            .expect('Cross-Origin-Resource-Policy', 'cross-origin')
            .expect(200)
    })

    it('sends the helmet security headers', async () => {
        const response = await request(app.getHttpServer()).get('/api/setup/status').expect(200)
        expect(response.headers['x-content-type-options']).toBe('nosniff')
        expect(response.headers['strict-transport-security']).toBe('max-age=31536000')
        expect(response.headers['cross-origin-resource-policy']).toBe('same-origin')
        expect(response.headers['content-security-policy']).toContain("script-src 'self' 'unsafe-eval'")
    })

    it('rejects invalid request bodies through the global ValidationPipe', async () => {
        await request(app.getHttpServer()).post('/api/setup/user').send({ email: 'not-an-email' }).expect(400)
    })
})
