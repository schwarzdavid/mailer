import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { MailModule } from '../mail/mail.module.js'
import { ThrottlerStorageModule } from '../throttler-storage/throttler-storage.module.js'
import { HealthController } from './controller/health.controller.js'
import { DatabaseHealthIndicator } from './indicators/database-health.indicator.js'
import { RedisHealthIndicator } from './indicators/redis-health.indicator.js'
import { SmtpHealthIndicator } from './indicators/smtp-health.indicator.js'
import { LivenessService } from './services/liveness.service.js'
import { ReadinessService } from './services/readiness.service.js'

@Module({
    imports: [TerminusModule, ThrottlerStorageModule, MailModule],
    controllers: [HealthController],
    providers: [DatabaseHealthIndicator, RedisHealthIndicator, SmtpHealthIndicator, LivenessService, ReadinessService],
})
export class HealthModule {}
