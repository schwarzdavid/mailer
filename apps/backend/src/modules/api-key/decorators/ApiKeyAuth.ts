import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiSecurity } from '@nestjs/swagger'
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler'
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard.js'
import { API_KEY_AUTH_KEY } from '../api-key.constants.js'

export const ApiKeyAuth = () =>
    applyDecorators(
        SetMetadata(API_KEY_AUTH_KEY, true),
        SkipThrottle({ default: true }),
        UseGuards(ThrottlerGuard, ApiKeyAuthGuard),
        ApiSecurity('api-key'),
        ApiSecurity('api-key-query'),
    )
