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

    it('answers cross-origin requests with CORS headers', async () => {
        await request(app.getHttpServer())
            .get('/api/setup/status')
            .set('Origin', 'https://frontend.example')
            .expect('Access-Control-Allow-Origin', '*')
            .expect(200)
    })

    it('rejects invalid request bodies through the global ValidationPipe', async () => {
        await request(app.getHttpServer()).post('/api/setup/user').send({ email: 'not-an-email' }).expect(400)
    })
})
