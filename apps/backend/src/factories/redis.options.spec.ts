import { ConfigService } from '@nestjs/config'
import { describe, expect, it } from 'vitest'
import { createIoRedisOptions, createRedisClientOptions } from './redis.options.js'
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

describe('redis options', () => {
    describe('createRedisClientOptions', () => {
        it('builds a plain redis url without credentials by default', () => {
            const options = createRedisClientOptions(configFor({}))

            expect(options).toMatchObject({ url: 'redis://127.0.0.1:6379/0' })
            expect(options).not.toHaveProperty('username')
            expect(options).not.toHaveProperty('password')
            expect(options.socket).not.toHaveProperty('tls')
        })

        it('passes username, password and tls to the node-redis client', () => {
            const options = createRedisClientOptions(
                configFor({
                    REDIS_USERNAME: 'app',
                    REDIS_PASSWORD: 's3cret',
                    REDIS_TLS: 'true',
                    REDIS_TLS_SERVERNAME: 'redis.internal',
                }),
            )

            expect(options).toMatchObject({
                url: 'rediss://127.0.0.1:6379/0',
                username: 'app',
                password: 's3cret',
                socket: { tls: true, servername: 'redis.internal' },
            })
        })

        it('keeps the credentials out of the url', () => {
            const options = createRedisClientOptions(configFor({ REDIS_USERNAME: 'app', REDIS_PASSWORD: 's3cret' }))

            expect(options.url).toBe('redis://127.0.0.1:6379/0')
        })

        it('keeps failing fast while disconnected', () => {
            const options = createRedisClientOptions(configFor({}))

            expect(options.disableOfflineQueue).toBe(true)
            expect(options.socket.connectTimeout).toBe(1000)
        })
    })

    describe('createIoRedisOptions', () => {
        it('builds ioredis options with only the connection fields', () => {
            expect(createIoRedisOptions(configFor({ REDIS_PASSWORD: 's3cret' }))).toEqual({
                host: '127.0.0.1',
                port: 6379,
                db: 0,
                password: 's3cret',
            })
        })

        it('sets no credentials or tls by default', () => {
            expect(createIoRedisOptions(configFor({}))).toEqual({ host: '127.0.0.1', port: 6379, db: 0 })
        })

        it('passes the username along with the password', () => {
            expect(createIoRedisOptions(configFor({ REDIS_USERNAME: 'app', REDIS_PASSWORD: 's3cret' }))).toMatchObject({
                username: 'app',
                password: 's3cret',
            })
        })

        it('enables tls for ioredis with the configured servername', () => {
            expect(
                createIoRedisOptions(configFor({ REDIS_TLS: 'true', REDIS_TLS_SERVERNAME: 'redis.internal' })).tls,
            ).toEqual({ servername: 'redis.internal' })
        })

        it('enables tls without a servername when none is configured', () => {
            expect(createIoRedisOptions(configFor({ REDIS_TLS: 'true' })).tls).toEqual({})
        })
    })
})
