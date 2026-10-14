import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { JwtAuth } from './JwtAuth.js'
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js'
import { PoliciesGuard } from '../../permission/guards/policies.guard.js'

describe('JwtAuth', () => {
    it('authenticates before evaluating policies on a decorated controller', () => {
        @JwtAuth()
        class Controller {}

        expect(Reflect.getMetadata(GUARDS_METADATA, Controller)).toEqual([JwtAuthGuard, PoliciesGuard])
    })

    it('authenticates before evaluating policies on a decorated handler', () => {
        class Controller {
            @JwtAuth()
            handler(this: void) {}
        }

        expect(Reflect.getMetadata(GUARDS_METADATA, Controller.prototype.handler)).toEqual([
            JwtAuthGuard,
            PoliciesGuard,
        ])
    })

    it('documents the bearer token requirement in the OpenAPI spec', () => {
        @JwtAuth()
        class Controller {}

        expect(Reflect.getMetadata('swagger/apiSecurity', Controller)).toEqual([{ bearer: [] }])
    })
})
