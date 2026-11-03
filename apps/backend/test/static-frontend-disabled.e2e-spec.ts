import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'

describe('static frontend outside NODE_ENV=production (e2e)', () => {
    let app: INestApplication<App>

    beforeAll(async () => {
        app = await createTestApp()
    })

    afterAll(async () => {
        await app?.close()
    })

    it('runs outside production', () => {
        expect(process.env.NODE_ENV).not.toBe('production')
    })

    it.each(['/', '/projects/5'])('leaves %s to the default 404 as before', async (path) => {
        const response = await request(app.getHttpServer()).get(path)

        expect(response.status).toBe(404)
        expect(response.text).toContain(`Cannot GET ${path}`)
    })
})
