import { describe, expect, it } from 'vitest'
import { envSchema, migrationEnvSchema } from './env.schema.js'

const requiredEnv: Record<string, string> = {
    BACKEND_JWT_SECRET: 'jwt-secret',
    BACKEND_ENCRYPTION_SECRET: 'encryption-secret',
    MAIL_HOSTNAME: 'mail.example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '1025',
}

describe('envSchema', () => {
    it('applies defaults and coerces ports and flags from their string form', () => {
        const env = envSchema.parse({ ...requiredEnv, DB_PORT: '5432', SMTP_SECURE: 'true' })

        expect(env).toMatchObject({
            PORT: 8000,
            DB_HOST: 'localhost',
            DB_PORT: 5432,
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: 6379,
            SMTP_PORT: 1025,
            SMTP_SECURE: true,
            SMTP_USER: '',
            SMTP_PASSWORD: '',
            IMAP_PORT: 993,
            IMAP_SECURE: true,
            PUBLIC_API_RATE_LIMIT: 60,
            PUBLIC_API_RATE_TTL: 60000,
        })
    })

    it('coerces the public api rate limit settings', () => {
        const env = envSchema.parse({ ...requiredEnv, PUBLIC_API_RATE_LIMIT: '5', PUBLIC_API_RATE_TTL: '1000' })

        expect(env).toMatchObject({ PUBLIC_API_RATE_LIMIT: 5, PUBLIC_API_RATE_TTL: 1000 })
    })

    it('rejects a non-positive public api rate limit', () => {
        expect(envSchema.safeParse({ ...requiredEnv, PUBLIC_API_RATE_LIMIT: '0' }).success).toBe(false)
    })

    it('normalizes MAIL_HOSTNAME to lower case without surrounding whitespace', () => {
        expect(envSchema.parse({ ...requiredEnv, MAIL_HOSTNAME: ' MX.Example.com ' }).MAIL_HOSTNAME).toBe(
            'mx.example.com',
        )
    })

    it.each(['localhost', 'https://mx.example.com', 'mx example.com', ''])('rejects "%s" as MAIL_HOSTNAME', (value) => {
        expect(envSchema.safeParse({ ...requiredEnv, MAIL_HOSTNAME: value }).success).toBe(false)
    })

    it.each(['BACKEND_JWT_SECRET', 'BACKEND_ENCRYPTION_SECRET', 'MAIL_HOSTNAME', 'SMTP_HOST', 'SMTP_PORT'])(
        'requires %s',
        (key) => {
            const result = envSchema.safeParse({ ...requiredEnv, [key]: undefined })

            expect(result.success).toBe(false)
            expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([key])
        },
    )

    it('rejects ports outside the valid range', () => {
        expect(envSchema.safeParse({ ...requiredEnv, SMTP_PORT: '70000' }).success).toBe(false)
    })

    it('requires IMAP credentials once IMAP_HOST is set', () => {
        const result = envSchema.safeParse({ ...requiredEnv, IMAP_HOST: 'imap.example.com' })

        expect(result.error?.issues.map((issue) => issue.path)).toEqual([['IMAP_USER'], ['IMAP_PASSWORD']])
    })

    it('accepts a missing IMAP_HOST without credentials', () => {
        expect(envSchema.safeParse(requiredEnv).success).toBe(true)
    })

    it('keeps the TLS servernames optional and passes them through when set', () => {
        expect(envSchema.parse(requiredEnv)).not.toHaveProperty('SMTP_TLS_SERVERNAME')
        expect(
            envSchema.parse({
                ...requiredEnv,
                SMTP_TLS_SERVERNAME: 'mx.example.com',
                IMAP_TLS_SERVERNAME: 'mx.example.com',
            }),
        ).toMatchObject({ SMTP_TLS_SERVERNAME: 'mx.example.com', IMAP_TLS_SERVERNAME: 'mx.example.com' })
    })

    describe('NODE_ENV', () => {
        it('defaults to development', () => {
            expect(envSchema.parse(requiredEnv).NODE_ENV).toBe('development')
        })

        it.each(['development', 'test', 'production'])('accepts %s', (value) => {
            expect(envSchema.parse({ ...requiredEnv, NODE_ENV: value }).NODE_ENV).toBe(value)
        })

        it.each(['staging', 'prod', ''])('rejects %j', (value) => {
            const result = envSchema.safeParse({ ...requiredEnv, NODE_ENV: value })

            expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['NODE_ENV'])
        })
    })

    describe('migrationEnvSchema', () => {
        it('accepts the encryption secret alone and defaults the database host', () => {
            const env = migrationEnvSchema.parse({ BACKEND_ENCRYPTION_SECRET: 'x' })

            expect(env.DB_HOST).toBe('localhost')
        })

        it('coerces the database port from its string form', () => {
            expect(migrationEnvSchema.parse({ BACKEND_ENCRYPTION_SECRET: 'x', DB_PORT: '5432' }).DB_PORT).toBe(5432)
        })

        it('requires the encryption secret', () => {
            const result = migrationEnvSchema.safeParse({})

            expect(result.success).toBe(false)
            expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['BACKEND_ENCRYPTION_SECRET'])
        })

        it('does not require SMTP or JWT settings', () => {
            expect(migrationEnvSchema.safeParse({ BACKEND_ENCRYPTION_SECRET: 'x' }).success).toBe(true)
        })
    })

    describe('TRUST_PROXY', () => {
        it.each([undefined, '', '   '])("keeps Express' untrusted default for %j", (value) => {
            expect(envSchema.parse({ ...requiredEnv, TRUST_PROXY: value }).TRUST_PROXY).toBe(false)
        })

        it.each([
            ['true', true],
            ['TRUE', true],
            ['false', false],
            ['0', 0],
            ['1', 1],
            ['2', 2],
            ['loopback', 'loopback'],
            ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
            ['172.16.0.1', '172.16.0.1'],
            ['-1', '-1'],
            [' 1 ', 1],
        ])('maps %j to %j', (value, expected) => {
            expect(envSchema.parse({ ...requiredEnv, TRUST_PROXY: value }).TRUST_PROXY).toBe(expected)
        })
    })
})
