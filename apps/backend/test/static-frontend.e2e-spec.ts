import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FRONTEND_PUBLIC_DIR } from '../src/factories/static-frontend.js'

const INDEX_HTML = '<!doctype html><html><body><div id="app"></div></body></html>'
const SPA_MARKER = '<div id="app">'

describe('static frontend under NODE_ENV=production (e2e)', () => {
    let app: INestApplication<App>
    let createdPublicDir = false
    const previousNodeEnv = process.env.NODE_ENV

    beforeAll(async () => {
        if (existsSync(FRONTEND_PUBLIC_DIR)) {
            throw new Error(
                `${FRONTEND_PUBLIC_DIR} already exists; move it away before running this suite, which creates and deletes that directory`,
            )
        }
        await mkdir(join(FRONTEND_PUBLIC_DIR, 'assets'), { recursive: true })
        createdPublicDir = true
        await writeFile(join(FRONTEND_PUBLIC_DIR, 'index.html'), INDEX_HTML)
        await writeFile(join(FRONTEND_PUBLIC_DIR, 'assets', 'app.js'), 'console.log("app")')
        await writeFile(join(FRONTEND_PUBLIC_DIR, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
        process.env.NODE_ENV = 'production'
        const { createTestApp } = await import('./support/app.js')
        app = await createTestApp()
    })

    afterAll(async () => {
        await app?.close()
        if (previousNodeEnv === undefined) {
            delete process.env.NODE_ENV
        } else {
            process.env.NODE_ENV = previousNodeEnv
        }
        if (createdPublicDir) {
            await rm(FRONTEND_PUBLIC_DIR, { recursive: true, force: true })
        }
    })

    it('serves index.html at the root without caching it', async () => {
        const response = await request(app.getHttpServer()).get('/')

        expect(response.status).toBe(200)
        expect(response.text).toContain(SPA_MARKER)
        expect(response.headers['cache-control']).toBe('no-cache')
        expect(response.headers['content-security-policy']).toContain("default-src 'self'")
    })

    it.each(['/projects/5', '/docs'])('falls back to index.html for the client route %s', async (path) => {
        const response = await request(app.getHttpServer()).get(path)

        expect(response.status).toBe(200)
        expect(response.text).toBe(INDEX_HTML)
        expect(response.headers['cache-control']).toBe('no-cache')
    })

    it('serves hashed assets as immutable', async () => {
        const response = await request(app.getHttpServer()).get('/assets/app.js')

        expect(response.status).toBe(200)
        expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    })

    it('serves other files without caching them', async () => {
        const response = await request(app.getHttpServer()).get('/favicon.svg')

        expect(response.status).toBe(200)
        expect(response.headers['cache-control']).toBe('no-cache')
    })

    it('answers a missing asset with 404 instead of index.html', async () => {
        const response = await request(app.getHttpServer()).get('/assets/missing.js')

        expect(response.status).toBe(404)
        expect(response.text).not.toContain(SPA_MARKER)
    })

    it('answers an unknown API path with the JSON 404 instead of index.html', async () => {
        const response = await request(app.getHttpServer()).get('/api/does-not-exist')

        expect(response.status).toBe(404)
        expect(response.headers['content-type']).toMatch(/^application\/json/)
        expect(response.text).not.toContain(SPA_MARKER)
    })

    it('still routes the API', async () => {
        const response = await request(app.getHttpServer()).get('/api/setup/status')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toMatch(/^application\/json/)
    })
})
