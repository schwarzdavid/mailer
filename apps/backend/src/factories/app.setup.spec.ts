import { ConfigService } from '@nestjs/config'
import { describe, expect, it } from 'vitest'
import { shouldServeApiDocs } from './app.setup.js'
import { envSchema, type Env } from '../config/env.schema.js'

const requiredEnv = {
    BACKEND_JWT_SECRET: 'jwt-secret',
    BACKEND_ENCRYPTION_SECRET: 'encryption-secret',
    MAIL_HOSTNAME: 'mail.example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
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
