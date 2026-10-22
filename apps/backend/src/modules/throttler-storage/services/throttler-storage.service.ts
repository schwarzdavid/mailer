import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common'
import type { ThrottlerStorage } from '@nestjs/throttler'
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import type { Redis } from 'ioredis'
import { ThrottlerStorageUnavailableError } from '../exceptions/throttler-storage-unavailable.error.js'
import { THROTTLER_REDIS_CLIENT } from '../throttler-storage.constants.js'

@Injectable()
export class ThrottlerStorageService implements ThrottlerStorage, OnApplicationShutdown {
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
            throw new ThrottlerStorageUnavailableError(error)
        }
    }

    onApplicationShutdown(): void {
        if (this.client.status !== 'end') {
            this.client.disconnect()
        }
    }
}
