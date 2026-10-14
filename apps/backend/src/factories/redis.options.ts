import type { ConfigService } from '@nestjs/config'
import type { RedisClientOptions } from '@redis/client'
import type { Env } from '../config/env.schema.js'

export function createRedisClientOptions(configService: ConfigService<Env, true>) {
    const host = configService.get('REDIS_HOST', { infer: true })
    const port = configService.get('REDIS_PORT', { infer: true })

    return {
        url: `redis://${host}:${port}/0`,
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: (retries: number) => Math.min(retries * 200, 2000),
        },
        // Reject commands immediately when disconnected instead of queueing
        // them — a Redis outage must never hang requests (e.g. the JWT guard).
        disableOfflineQueue: true,
    } satisfies RedisClientOptions
}
