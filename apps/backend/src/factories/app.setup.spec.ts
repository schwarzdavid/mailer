import { ConfigService } from '@nestjs/config'
import { describe, expect, it } from 'vitest'
import { corsOptionsFor, helmetOptions, shouldServeApiDocs } from './app.setup.js'
import { envSchema, type Env } from '../config/env.schema.js'

const requiredEnv = {
    BACKEND_JWT_SECRET: 'jwt-secret-for-unit-tests-0123456789',
    BACKEND_ENCRYPTION_SECRET: 'encryption-secret-for-unit-tests-0123',
    MAIL_HOSTNAME: 'mail.example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    DB_USERNAME: 'mailer',
    DB_PASSWORD: 'secret',
    DB_DATABASE: 'mailer',
}

function configFor(env: Record<string, string>): ConfigService<Env, true> {
    return new ConfigService<Env, true>(envSchema.parse({ ...requiredEnv, ...env }))
}

describe('shouldServeApiDocs', () => {
    it.each(['development', 'test'])('mounts the API docs when NODE_ENV is %s', (nodeEnv) => {
        expect(shouldServeApiDocs(configFor({ NODE_ENV: nodeEnv }))).toBe(true)
    })

    it('mounts the API docs when NODE_ENV is unset', () => {
        expect(shouldServeApiDocs(configFor({}))).toBe(true)
    })

    it('keeps the API docs off in production', () => {
        expect(shouldServeApiDocs(configFor({ NODE_ENV: 'production' }))).toBe(false)
    })
})

describe('corsOptionsFor', () => {
    it('allows every origin on public form routes without credentials', () => {
        expect(corsOptionsFor('/api/public/form/contact/token')).toEqual({ origin: '*', credentials: false })
    })

    it('turns CORS off everywhere else', () => {
        expect(corsOptionsFor('/api/auth/login')).toEqual({ origin: false })
        expect(corsOptionsFor('/api/v1/send')).toEqual({ origin: false })
    })

    it('does not treat a path that merely starts like the public prefix as public', () => {
        expect(corsOptionsFor('/api/public/formular')).toEqual({ origin: false })
    })
})

describe('helmetOptions', () => {
    it('lets the SPA compile Handlebars templates and preview remote images', () => {
        const directives = helmetOptions.contentSecurityPolicy
        expect(directives).toMatchObject({
            directives: { scriptSrc: ["'self'", "'unsafe-eval'"], imgSrc: ["'self'", 'data:', 'https:'] },
        })
    })

    it('does not upgrade plain-HTTP requests, so the SPA also works on a site served without TLS', () => {
        expect(helmetOptions.contentSecurityPolicy).toMatchObject({ directives: { upgradeInsecureRequests: null } })
    })

    it('pins HTTPS for a year without covering subdomains', () => {
        expect(helmetOptions.strictTransportSecurity).toEqual({ maxAge: 31536000, includeSubDomains: false })
    })
})
