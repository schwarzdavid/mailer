import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStaticFrontendOptions, FRONTEND_PUBLIC_DIR } from './static-frontend.js'
import { envSchema, type Env } from '../config/env.schema.js'

const requiredEnv = {
    BACKEND_JWT_SECRET: 'jwt-secret',
    BACKEND_ENCRYPTION_SECRET: 'encryption-secret',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
}

function configFor(env: Record<string, string>): ConfigService<Env, true> {
    return new ConfigService<Env, true>(envSchema.parse({ ...requiredEnv, ...env }))
}

const production = configFor({ NODE_ENV: 'production' })

describe('createStaticFrontendOptions', () => {
    let publicDir: string
    let emptyDir: string

    beforeAll(() => {
        publicDir = mkdtempSync(join(tmpdir(), 'frontend-public-'))
        writeFileSync(join(publicDir, 'index.html'), '<!doctype html>')
        emptyDir = mkdtempSync(join(tmpdir(), 'frontend-empty-'))
    })

    afterAll(() => {
        rmSync(publicDir, { recursive: true, force: true })
        rmSync(emptyDir, { recursive: true, force: true })
    })

    function cacheControlFor(filePath: string): string | number | string[] | undefined {
        const [options] = createStaticFrontendOptions(production, publicDir)
        const response = new ServerResponse(new IncomingMessage(new Socket()))
        options?.serveStaticOptions?.setHeaders?.(response, filePath, undefined)
        return response.getHeader('Cache-Control')
    }

    it('resolves the fixed public directory beside the backend package', () => {
        expect(FRONTEND_PUBLIC_DIR).toBe(resolve(import.meta.dirname, '..', '..', 'public'))
    })

    it.each(['development', 'test'])('serves nothing when NODE_ENV is %s', (nodeEnv) => {
        expect(createStaticFrontendOptions(configFor({ NODE_ENV: nodeEnv }), publicDir)).toEqual([])
    })

    it('serves nothing when NODE_ENV is unset', () => {
        expect(createStaticFrontendOptions(configFor({}), publicDir)).toEqual([])
    })

    it('refuses to start in production without an index.html', () => {
        expect(() => createStaticFrontendOptions(production, emptyDir)).toThrow(join(emptyDir, 'index.html'))
    })

    it('serves the public directory in production', () => {
        const [options] = createStaticFrontendOptions(production, publicDir)

        expect(options?.rootPath).toBe(publicDir)
    })

    it('keeps the API and the asset directory out of the index.html fallback', () => {
        const [options] = createStaticFrontendOptions(production, publicDir)

        expect(options?.exclude).toEqual(['/api/{*path}', '/assets/{*path}'])
    })

    it('marks hashed assets immutable', () => {
        expect(cacheControlFor(join(publicDir, 'assets', 'app-1a2b3c.js'))).toBe('public, max-age=31536000, immutable')
    })

    it.each([
        ['index.html', 'index.html'],
        ['a root file', 'favicon.svg'],
        ['a file merely named like the asset directory', 'assets.json'],
    ])('revalidates %s on every request', (_, fileName) => {
        expect(cacheControlFor(join(publicDir, fileName))).toBe('no-cache')
    })
})
