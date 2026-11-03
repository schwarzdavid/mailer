import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { createOpenApiDocument } from '../src/factories/app.setup.js'
import { createTestApp } from './support/app.js'

describe('Health endpoints (e2e)', () => {
    let app: INestApplication<App>

    beforeAll(async () => {
        app = await createTestApp()
    })

    afterAll(async () => {
        await app?.close()
    })

    it('reports liveness with the database check', async () => {
        const response = await request(app.getHttpServer()).get('/api/health').expect(200)

        expect(response.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } })
    })

    it('reports readiness with the database, Redis and SMTP checks', async () => {
        const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200)

        expect(response.body).toMatchObject({
            status: 'ok',
            info: {
                database: { status: 'up' },
                redis: { status: 'up' },
                smtp: { status: 'up' },
            },
        })
    })

    it('is not rate limited, so frequent probes never see a 429', async () => {
        const statuses: number[] = []
        for (let attempt = 0; attempt < 15; attempt++) {
            const response = await request(app.getHttpServer()).get('/api/health')
            statuses.push(response.status)
        }

        expect(statuses).toEqual(Array.from({ length: 15 }, () => 200))
    })

    it('gives no origin CORS headers', async () => {
        const response = await request(app.getHttpServer())
            .get('/api/health')
            .set('Origin', 'https://evil.example')
            .expect(200)

        expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('stays out of the OpenAPI document, so the generated client has no health API', () => {
        const paths = Object.keys(createOpenApiDocument(app).paths)

        expect(paths.length).toBeGreaterThan(0)
        expect(paths.filter((path) => path.startsWith('/api/health'))).toEqual([])
    })
})
