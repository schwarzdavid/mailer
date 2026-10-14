import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ThrottlerGuard } from '@nestjs/throttler'
import { describe, expect, it } from 'vitest'
import { ApiKeyAuth } from './ApiKeyAuth.js'
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard.js'
import { API_KEY_AUTH_KEY } from '../api-key.constants.js'

describe('ApiKeyAuth', () => {
    class Controller {
        @ApiKeyAuth()
        handler(this: void) {}
    }

    it('throttles before authenticating the api key', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, Controller.prototype.handler)).toEqual([
            ThrottlerGuard,
            ApiKeyAuthGuard,
        ])
    })

    it('marks the route as an api key route', () => {
        expect(Reflect.getMetadata(API_KEY_AUTH_KEY, Controller.prototype.handler)).toBe(true)
    })

    it('skips the default throttler so only the public api budget applies', () => {
        expect(Reflect.getMetadata('THROTTLER:SKIPdefault', Controller.prototype.handler)).toBe(true)
    })

    it('documents both key transports in the OpenAPI spec', () => {
        expect(Reflect.getMetadata('swagger/apiSecurity', Controller.prototype.handler)).toEqual([
            { 'api-key': [] },
            { 'api-key-query': [] },
        ])
    })
})
