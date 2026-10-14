import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import type { ThrottlerStorage } from '@nestjs/throttler'
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import type { Redis } from 'ioredis'
import { THROTTLER_REDIS_CLIENT } from '../throttler-storage.constants.js'

@Injectable()
export class FailOpenThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
    private readonly logger = new Logger(FailOpenThrottlerStorage.name)

    constructor(
        @Inject(ThrottlerStorageRedisService)
        private readonly storage: Pick<ThrottlerStorageRedisService, 'increment'>,
        @Inject(THROTTLER_REDIS_CLIENT) private readonly client: Pick<Redis, 'status' | 'disconnect'>,
    ) {}

    async increment(
        key: string,
        ttl: number,
        limit: number,
        blockDuration: number,
        throttlerName: string,
    ): ReturnType<ThrottlerStorage['increment']> {
        try {
            return await this.storage.increment(key, ttl, limit, blockDuration, throttlerName)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.warn(`Rate limit not enforced, Redis throttler storage unavailable: ${message}`)

            return { totalHits: 0, timeToExpire: Math.ceil(ttl / 1000), isBlocked: false, timeToBlockExpire: 0 }
        }
    }

    onApplicationShutdown(): void {
        if (this.client.status !== 'end') {
            this.client.disconnect()
        }
    }
}
