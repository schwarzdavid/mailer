import type { ConfigService } from '@nestjs/config'
import type { RedisClientOptions } from '@redis/client'
import type { RedisOptions } from 'ioredis'
import type { Env } from '../config/env.schema.js'

export function createRedisClientOptions(configService: ConfigService<Env, true>) {
    const host = configService.get('REDIS_HOST', { infer: true })
    const port = configService.get('REDIS_PORT', { infer: true })
    const username = configService.get('REDIS_USERNAME', { infer: true })
    const password = configService.get('REDIS_PASSWORD', { infer: true })
    const tls = configService.get('REDIS_TLS', { infer: true })
    const servername = configService.get('REDIS_TLS_SERVERNAME', { infer: true })

    return {
        url: `${tls ? 'rediss' : 'redis'}://${host}:${port}/0`,
        ...(username && { username }),
        ...(password && { password }),
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: (retries: number) => Math.min(retries * 200, 2000),
            ...(tls && { tls: true as const, ...(servername && { servername }) }),
        },
        // Reject commands immediately when disconnected instead of queueing
        // them — a Redis outage must never hang requests (e.g. the JWT guard).
        disableOfflineQueue: true,
    } satisfies RedisClientOptions
}

export function createIoRedisOptions(
    configService: ConfigService<Env, true>,
): Pick<RedisOptions, 'host' | 'port' | 'db' | 'username' | 'password' | 'tls'> {
    const username = configService.get('REDIS_USERNAME', { infer: true })
    const password = configService.get('REDIS_PASSWORD', { infer: true })
    const tls = configService.get('REDIS_TLS', { infer: true })
    const servername = configService.get('REDIS_TLS_SERVERNAME', { infer: true })

    return {
        host: configService.get('REDIS_HOST', { infer: true }),
        port: configService.get('REDIS_PORT', { infer: true }),
        db: 0,
        ...(username && { username }),
        ...(password && { password }),
        ...(tls && { tls: servername ? { servername } : {} }),
    }
}
