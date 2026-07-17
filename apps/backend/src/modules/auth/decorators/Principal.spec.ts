import 'reflect-metadata'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { Principal } from './Principal'
import type { User } from '../../user/interfaces/user.interface'

type PrincipalFactory = (data: unknown, ctx: ExecutionContext) => User

const resolvePrincipalFactory = (): PrincipalFactory => {
    class Probe {
        handler(@Principal() principal: User): User {
            return principal
        }
    }

    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
        string,
        { factory: PrincipalFactory }
    >

    return args[Object.keys(args)[0]!]!.factory
}

const contextWithUser = (user: User | undefined): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext

describe('Principal', () => {
    const user: User = {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        roleId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    it('returns the authenticated user attached to the request', () => {
        const factory = resolvePrincipalFactory()

        expect(factory(undefined, contextWithUser(user))).toEqual(user)
    })

    it('throws Unauthorized when the request carries no user', () => {
        const factory = resolvePrincipalFactory()

        expect(() => factory(undefined, contextWithUser(undefined))).toThrow(UnauthorizedException)
    })
})
