import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { describe, expect, it } from 'vitest'
import { createSequelizeOptions, envFilePath } from './database.config.js'
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
            logging: false,
            pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 },
        })
    })

    it('falls back to localhost when no host is configured', () => {
        expect(createSequelizeOptions(configFor({})).host).toBe('localhost')
    })

    it('never lets Sequelize synchronize the schema over the migrations', () => {
        expect(createSequelizeOptions(configFor({})).synchronize).toBe(false)
    })

    it('never logs SQL statements', () => {
        expect(createSequelizeOptions(configFor({})).logging).toBe(false)
    })

    it('enables TLS with certificate verification when DB_SSL is set', () => {
        expect(createSequelizeOptions(configFor({ DB_SSL: 'true' })).dialectOptions).toEqual({
            ssl: { rejectUnauthorized: true },
        })
    })

    it('can skip certificate verification for self-signed database servers', () => {
        expect(
            createSequelizeOptions(configFor({ DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' })).dialectOptions,
        ).toEqual({ ssl: { rejectUnauthorized: false } })
    })

    it('sets no dialect options without DB_SSL', () => {
        expect(createSequelizeOptions(configFor({}))).not.toHaveProperty('dialectOptions')
    })

    it('sizes the pool from DB_POOL_MAX', () => {
        expect(createSequelizeOptions(configFor({ DB_POOL_MAX: '3' })).pool).toEqual({
            max: 3,
            min: 0,
            acquire: 30_000,
            idle: 10_000,
        })
    })
})
