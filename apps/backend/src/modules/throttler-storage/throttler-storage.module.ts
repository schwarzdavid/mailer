import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import { Redis } from 'ioredis'
import type { Env } from '../../config/env.schema.js'
import { createIoRedisOptions } from '../../factories/redis.options.js'
import { ThrottlerStorageService } from './services/throttler-storage.service.js'
import { THROTTLER_KEY_PREFIX, THROTTLER_REDIS_CLIENT } from './throttler-storage.constants.js'

@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: THROTTLER_REDIS_CLIENT,
            inject: [ConfigService],
            useFactory(configService: ConfigService<Env, true>): Redis {
                const logger = new Logger('ThrottlerStorage')
                const client = new Redis({
                    ...createIoRedisOptions(configService),
                    keyPrefix: THROTTLER_KEY_PREFIX,
                    connectTimeout: 1000,
                    retryStrategy: (retries: number) => Math.min(retries * 200, 2000),
                    // Reject commands immediately while disconnected instead of queueing
                    // them, so a Redis outage fails fast rather than hanging requests.
                    enableOfflineQueue: false,
                    maxRetriesPerRequest: 0,
                })
                client.on('error', (error: Error) => logger.error(`Redis throttler storage error: ${error.message}`))
                return client
            },
        },
        {
            provide: ThrottlerStorageRedisService,
            inject: [THROTTLER_REDIS_CLIENT],
            useFactory: (client: Redis) => new ThrottlerStorageRedisService(client),
        },
        ThrottlerStorageService,
    ],
    exports: [ThrottlerStorageService, THROTTLER_REDIS_CLIENT],
})
export class ThrottlerStorageModule {}
