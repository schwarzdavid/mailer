import { Inject, Injectable } from '@nestjs/common'
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus'
import type { Redis } from 'ioredis'
import { THROTTLER_REDIS_CLIENT } from '../../throttler-storage/throttler-storage.constants.js'
import { HEALTH_TIMEOUT_MS } from '../health.constants.js'
import { probeWithin } from '../helpers/probe-within.js'

@Injectable()
export class RedisHealthIndicator {
    constructor(
        @Inject(THROTTLER_REDIS_CLIENT) private readonly client: Pick<Redis, 'ping'>,
        private readonly healthIndicatorService: HealthIndicatorService,
    ) {}

    isHealthy(key: string): Promise<HealthIndicatorResult> {
        return probeWithin(this.healthIndicatorService.check(key), () => this.client.ping(), HEALTH_TIMEOUT_MS)
    }
}
