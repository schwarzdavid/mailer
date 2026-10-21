import { describe, expect, it } from 'vitest'
import { envSchema } from '../config/env.schema.js'
import { applySpecPlaceholderEnv } from './spec-env.js'

describe('applySpecPlaceholderEnv', () => {
    it('fills an empty env so that it satisfies the env schema', () => {
        const env: NodeJS.ProcessEnv = {}

        applySpecPlaceholderEnv(env)

        expect(envSchema.safeParse(env).success).toBe(true)
    })

    it('leaves already set values unchanged', () => {
        const env: NodeJS.ProcessEnv = { SMTP_HOST: 'smtp.real' }

        applySpecPlaceholderEnv(env)

        expect(env.SMTP_HOST).toBe('smtp.real')
    })
})
