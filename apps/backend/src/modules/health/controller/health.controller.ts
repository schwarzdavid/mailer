import { Controller, Get } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { HealthCheck } from '@nestjs/terminus'
import { Public } from '../../auth/decorators/Public.js'
import { LivenessService } from '../services/liveness.service.js'
import { ReadinessService } from '../services/readiness.service.js'

@Controller('health')
@Public()
@SkipThrottle()
@ApiExcludeController()
export class HealthController {
    constructor(
        private readonly livenessService: LivenessService,
        private readonly readinessService: ReadinessService,
    ) {}

    @Get()
    @HealthCheck()
    liveness() {
        return this.livenessService.check()
    }

    @Get('ready')
    @HealthCheck()
    readiness() {
        return this.readinessService.check()
    }
}
