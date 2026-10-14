import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { describe, expect, it } from 'vitest'
import { createSequelizeOptions, envFilePath } from './database.config.js'
import { envSchema, type Env } from '../config/env.schema.js'

const requiredEnv = {
    BACKEND_JWT_SECRET: 'jwt-secret',
    BACKEND_DKIM_SECRET: 'dkim-secret',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
}

function configFor(env: Record<string, string>): ConfigService<Env, true> {
    return new ConfigService<Env, true>(envSchema.parse({ ...requiredEnv, ...env }))
}

describe('database config', () => {
    it('points the env file at the repository root', () => {
        const [path] = envFilePath

        expect(envFilePath).toHaveLength(1)
        expect(path).toBe(join(import.meta.dirname, '..', '..', '..', '..', '.env'))
        expect(existsSync(join(dirname(path!), 'pnpm-workspace.yaml'))).toBe(true)
    })

    it('connects to Postgres with the validated credentials', () => {
        const options = createSequelizeOptions(
            configFor({
                DB_HOST: 'db.internal',
                DB_PORT: '6543',
                DB_USERNAME: 'mailer',
                DB_PASSWORD: 'secret',
                DB_DATABASE: 'mailer_prod',
            }),
        )

        expect(options).toEqual({
            dialect: 'postgres',
            host: 'db.internal',
            port: 6543,
            username: 'mailer',
            password: 'secret',
            database: 'mailer_prod',
            autoLoadModels: true,
            synchronize: false,
        })
    })

    it('falls back to localhost when no host is configured', () => {
        expect(createSequelizeOptions(configFor({})).host).toBe('localhost')
    })

    it('never lets Sequelize synchronize the schema over the migrations', () => {
        expect(createSequelizeOptions(configFor({})).synchronize).toBe(false)
    })
})
