import { describe, expect, it } from 'vitest'
import { envSchema } from './env.schema.js'

const requiredEnv: Record<string, string> = {
    BACKEND_JWT_SECRET: 'jwt-secret',
    BACKEND_DKIM_SECRET: 'dkim-secret',
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
        })
    })

    it.each(['BACKEND_JWT_SECRET', 'BACKEND_DKIM_SECRET', 'SMTP_HOST', 'SMTP_PORT'])('requires %s', (key) => {
        const result = envSchema.safeParse({ ...requiredEnv, [key]: undefined })

        expect(result.success).toBe(false)
        expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([key])
    })

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
})
