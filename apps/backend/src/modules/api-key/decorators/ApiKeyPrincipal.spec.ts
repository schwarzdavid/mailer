import 'reflect-metadata'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { ApiKeyPrincipal } from './ApiKeyPrincipal.js'
import type { ApiKey } from '../interfaces/api-key.interface.js'

type ApiKeyPrincipalFactory = (data: unknown, ctx: ExecutionContext) => ApiKey

const resolveFactory = (): ApiKeyPrincipalFactory => {
    class Probe {
        handler(@ApiKeyPrincipal() apiKey: ApiKey): ApiKey {
            return apiKey
        }
    }

    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
        string,
        { factory: ApiKeyPrincipalFactory }
    >

    return args[Object.keys(args)[0]!]!.factory
}

const contextWithApiKey = (apiKey: ApiKey | undefined): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ apiKey }) }) }) as unknown as ExecutionContext

describe('ApiKeyPrincipal', () => {
    const apiKey: ApiKey = {
        apiKeyId: 11,
        projectId: 3,
        name: 'Newsletter',
        prefix: 'sdm_abcdEFGH',
        createdByUserId: 7,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    it('returns the authenticated api key attached to the request', () => {
        expect(resolveFactory()(undefined, contextWithApiKey(apiKey))).toEqual(apiKey)
    })

    it('throws Unauthorized when the request carries no api key', () => {
        expect(() => resolveFactory()(undefined, contextWithApiKey(undefined))).toThrow(UnauthorizedException)
    })
})
