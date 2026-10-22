import { Injectable } from '@nestjs/common'
import { InjectConnection } from '@nestjs/sequelize'
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus'
import { HEALTH_TIMEOUT_MS } from '../health.constants.js'
import { probeWithin } from '../helpers/probe-within.js'

export interface QueryableConnection {
    query(sql: string): Promise<unknown>
}

@Injectable()
export class DatabaseHealthIndicator {
    constructor(
        @InjectConnection() private readonly sequelize: QueryableConnection,
        private readonly healthIndicatorService: HealthIndicatorService,
    ) {}

    isHealthy(key: string): Promise<HealthIndicatorResult> {
        return probeWithin(
            this.healthIndicatorService.check(key),
            () => this.sequelize.query('SELECT 1'),
            HEALTH_TIMEOUT_MS,
        )
    }
}
