import { Injectable } from '@nestjs/common'
import { HealthCheckService, type HealthCheckResult } from '@nestjs/terminus'
import { READINESS_CACHE_MS } from '../health.constants.js'
import { CachedHealthCheck } from '../helpers/cached-health-check.js'
import { DatabaseHealthIndicator } from '../indicators/database-health.indicator.js'
import { RedisHealthIndicator } from '../indicators/redis-health.indicator.js'
import { SmtpHealthIndicator } from '../indicators/smtp-health.indicator.js'

@Injectable()
export class ReadinessService {
    private readonly cachedCheck = new CachedHealthCheck(() => this.runChecks(), READINESS_CACHE_MS)

    constructor(
        private readonly health: HealthCheckService,
        private readonly databaseIndicator: DatabaseHealthIndicator,
        private readonly redisIndicator: RedisHealthIndicator,
        private readonly smtpIndicator: SmtpHealthIndicator,
    ) {}

    check(): Promise<HealthCheckResult> {
        return this.cachedCheck.check()
    }

    private runChecks(): Promise<HealthCheckResult> {
        return this.health.check([
            () => this.databaseIndicator.isHealthy('database'),
            () => this.redisIndicator.isHealthy('redis'),
            () => this.smtpIndicator.isHealthy('smtp'),
        ])
    }
}
