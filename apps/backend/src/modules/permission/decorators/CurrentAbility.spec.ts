import 'reflect-metadata'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { createMongoAbility } from '@casl/ability'
import { describe, expect, it } from 'vitest'
import { CurrentAbility } from './CurrentAbility.js'
import type { AppAbility } from '../interfaces/app-ability.js'

type AbilityFactory = (data: unknown, ctx: ExecutionContext) => AppAbility

const resolveAbilityFactory = (): AbilityFactory => {
    class Probe {
        handler(@CurrentAbility() ability: AppAbility): AppAbility {
            return ability
        }
    }

    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
        string,
        { factory: AbilityFactory }
    >

    return args[Object.keys(args)[0]!]!.factory
}

const contextWithAbility = (ability: AppAbility | undefined): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ ability }) }) }) as unknown as ExecutionContext

describe('CurrentAbility', () => {
    it('returns the ability the policies guard attached to the request', () => {
        const ability = createMongoAbility<AppAbility>([{ action: 'read', subject: 'Domain' }])

        expect(resolveAbilityFactory()(undefined, contextWithAbility(ability))).toBe(ability)
    })

    it('throws Unauthorized when no ability was attached', () => {
        expect(() => resolveAbilityFactory()(undefined, contextWithAbility(undefined))).toThrow(UnauthorizedException)
    })
})
