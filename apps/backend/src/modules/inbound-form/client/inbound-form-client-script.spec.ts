import * as fs from 'node:fs'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { envSchema, type Env } from '../../../config/env.schema.js'
import { InboundFormClientScript, loadInboundFormClientScript } from './inbound-form-client-script.js'

vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>()
    return { ...actual, readFileSync: vi.fn() }
})

vi.mock('node:module', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:module')>()
    return { ...actual, createRequire: () => ({ resolve: (id: string) => `/resolved/${id}` }) }
})

const readFileSync = vi.mocked(fs.readFileSync)
const bundlePath = '/resolved/@schwarzdavid/mailer-client/client.iife.js'

const requiredEnv = {
    BACKEND_JWT_SECRET: 'jwt-secret-for-unit-tests-0123456789',
    BACKEND_ENCRYPTION_SECRET: 'encryption-secret-for-unit-tests-0123',
    MAIL_HOSTNAME: 'mail.example.com',
    MAIL_SERVER_IPV4: '203.0.113.10',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    DB_USERNAME: 'mailer',
    DB_PASSWORD: 'secret',
    DB_DATABASE: 'mailer',
}

function configFor(nodeEnv: Env['NODE_ENV']): ConfigService<Env, true> {
    return new ConfigService<Env, true>(envSchema.parse({ ...requiredEnv, NODE_ENV: nodeEnv }))
}

function missingBundle(): never {
    throw Object.assign(new Error('no such file'), { code: 'ENOENT' })
}

describe('loadInboundFormClientScript', () => {
    beforeEach(() => {
        readFileSync.mockReset()
    })

    it('reads the bundle the package exports', () => {
        readFileSync.mockReturnValue('bundle')

        expect(loadInboundFormClientScript()).toBe('bundle')
        expect(readFileSync).toHaveBeenCalledWith(bundlePath, 'utf8')
    })

    it('propagates a resolve failure', () => {
        const resolve: Mock<(id: string) => string> = vi.fn<(id: string) => string>().mockImplementation(() => {
            throw new Error('cannot resolve')
        })

        expect(() => loadInboundFormClientScript(resolve)).toThrow('cannot resolve')
    })
})

describe('InboundFormClientScript', () => {
    let warn: Mock<Logger['warn']>

    beforeEach(() => {
        readFileSync.mockReset()
        warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    })

    afterEach(() => {
        warn.mockRestore()
    })

    it('serves the bundle read at startup under production', () => {
        readFileSync.mockReturnValueOnce('startup').mockReturnValueOnce('rebuilt')

        const script = new InboundFormClientScript(configFor('production'))

        expect(script.source).toBe('startup')
        expect(script.source).toBe('startup')
        expect(readFileSync).toHaveBeenCalledTimes(1)
    })

    it('refuses to start under production without the bundle', () => {
        readFileSync.mockImplementation(missingBundle)

        expect(() => new InboundFormClientScript(configFor('production'))).toThrow('no such file')
    })

    it.each(['development', 'test'] as const)('serves the current bundle under %s', (nodeEnv) => {
        readFileSync.mockReturnValueOnce('startup').mockReturnValueOnce('rebuilt')

        const script = new InboundFormClientScript(configFor(nodeEnv))

        expect(script.source).toBe('rebuilt')
        expect(warn).not.toHaveBeenCalled()
    })

    it.each(['development', 'test'] as const)(
        'starts without the bundle under %s and serves it once it is built',
        (nodeEnv) => {
            readFileSync.mockImplementation(missingBundle)

            const script = new InboundFormClientScript(configFor(nodeEnv))

            expect(script.source).toBeUndefined()
            expect(warn).toHaveBeenCalledTimes(1)
            expect(warn.mock.calls[0]?.[0]).toContain('client.js answers 404')
            expect(warn.mock.calls[0]?.[0]).toContain('Error (code ENOENT)')
            expect(warn.mock.calls[0]?.[0]).not.toContain('no such file')

            readFileSync.mockReturnValue('built')

            expect(script.source).toBe('built')
        },
    )
})
