import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiSecurity } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { AppThrottlerGuard } from '../../throttler-storage/guards/app-throttler.guard.js'
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard.js'
import { API_KEY_AUTH_KEY } from '../api-key.constants.js'

export const ApiKeyAuth = () =>
    applyDecorators(
        SetMetadata(API_KEY_AUTH_KEY, true),
        SkipThrottle({ default: true }),
        UseGuards(AppThrottlerGuard, ApiKeyAuthGuard),
        ApiSecurity('api-key'),
        ApiSecurity('api-key-query'),
    )
