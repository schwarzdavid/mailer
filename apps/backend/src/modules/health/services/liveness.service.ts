import { Injectable } from '@nestjs/common'
import { HealthCheckService, type HealthCheckResult } from '@nestjs/terminus'
import { LIVENESS_CACHE_MS } from '../health.constants.js'
import { CachedHealthCheck } from '../helpers/cached-health-check.js'
import { DatabaseHealthIndicator } from '../indicators/database-health.indicator.js'

@Injectable()
export class LivenessService {
    private readonly cachedCheck = new CachedHealthCheck(() => this.runChecks(), LIVENESS_CACHE_MS)

    constructor(
        private readonly health: HealthCheckService,
        private readonly databaseIndicator: DatabaseHealthIndicator,
    ) {}

    check(): Promise<HealthCheckResult> {
        return this.cachedCheck.check()
    }

    private runChecks(): Promise<HealthCheckResult> {
        return this.health.check([() => this.databaseIndicator.isHealthy('database')])
    }
}
