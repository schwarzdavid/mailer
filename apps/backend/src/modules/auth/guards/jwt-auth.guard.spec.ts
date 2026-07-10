import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PUBLIC_KEY } from '../decorators/Public'

describe('JwtAuthGuard', () => {
    let guard: JwtAuthGuard
    let getAllAndOverride: Mock<Reflector['getAllAndOverride']>

    const handler = () => undefined
    class Controller {}

    const context = {
        getHandler: () => handler,
        getClass: () => Controller,
    } as unknown as ExecutionContext

    beforeEach(() => {
        getAllAndOverride = vi.fn<Reflector['getAllAndOverride']>()
        const reflector = { getAllAndOverride } as unknown as Reflector
        guard = new JwtAuthGuard(reflector)
    })

    it('skips authentication for routes flagged as public', () => {
        getAllAndOverride.mockReturnValue(true)

        expect(guard.canActivate(context)).toBe(true)
        expect(getAllAndOverride).toHaveBeenCalledWith(PUBLIC_KEY, [handler, Controller])
    })

    it('delegates to passport authentication when the route is not public', () => {
        getAllAndOverride.mockReturnValue(false)
        const passportGuardProto = Object.getPrototypeOf(Object.getPrototypeOf(guard)) as {
            canActivate: (context: ExecutionContext) => boolean
        }
        const superCanActivate = vi.spyOn(passportGuardProto, 'canActivate').mockReturnValue(true)

        expect(guard.canActivate(context)).toBe(true)
        expect(superCanActivate).toHaveBeenCalledWith(context)

        superCanActivate.mockRestore()
    })
})
