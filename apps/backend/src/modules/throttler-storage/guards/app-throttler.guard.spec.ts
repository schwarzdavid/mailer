import 'reflect-metadata'
import { ExecutionContext, Logger, ServiceUnavailableException, Type } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js'
import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler'
import type { Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { FailClosedThrottle } from '../decorators/FailClosedThrottle.js'
import { ThrottlerStorageUnavailableError } from '../exceptions/throttler-storage-unavailable.error.js'
import { AppThrottlerGuard } from './app-throttler.guard.js'

class OpenController {
    handle(this: void) {}
}

class ClosedController {
    @FailClosedThrottle()
    handle(this: void) {}
}

function contextFor(controller: Type, handler: () => void): ExecutionContext {
    const request = { ip: '203.0.113.7', headers: {} }
    const response = { header: vi.fn<Response['header']>() }

    return new ExecutionContextHost([request, response], controller, handler)
}

describe('AppThrottlerGuard', () => {
    let guard: AppThrottlerGuard
    let increment: Mock<ThrottlerStorage['increment']>
    let warn: Mock<Logger['warn']>

    beforeEach(async () => {
        warn = vi.fn<Logger['warn']>()
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(warn)

        increment = vi.fn<ThrottlerStorage['increment']>()
        guard = new AppThrottlerGuard({ throttlers: [{ ttl: 60_000, limit: 10 }] }, { increment }, new Reflector())
        await guard.onModuleInit()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('lets the request through when the budget is not exhausted', async () => {
        increment.mockResolvedValue({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 })

        await expect(guard.canActivate(contextFor(OpenController, OpenController.prototype.handle))).resolves.toBe(true)
    })

    it('lets the request through and warns when the storage is unavailable on a fail-open route', async () => {
        increment.mockRejectedValue(new ThrottlerStorageUnavailableError(new Error('Connection is closed.')))

        await expect(guard.canActivate(contextFor(OpenController, OpenController.prototype.handle))).resolves.toBe(true)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rate limit not enforced'))
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Connection is closed.'))
    })

    it('answers 503 when the storage is unavailable on a fail-closed route', async () => {
        increment.mockRejectedValue(new ThrottlerStorageUnavailableError(new Error('Connection is closed.')))

        await expect(
            guard.canActivate(contextFor(ClosedController, ClosedController.prototype.handle)),
        ).rejects.toBeInstanceOf(ServiceUnavailableException)
        expect(warn).not.toHaveBeenCalled()
    })

    it('still answers 429 on a fail-open route when the limit is exceeded', async () => {
        increment.mockResolvedValue({ totalHits: 11, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 60 })

        await expect(
            guard.canActivate(contextFor(OpenController, OpenController.prototype.handle)),
        ).rejects.toBeInstanceOf(ThrottlerException)
    })

    it('still answers 429 on a fail-closed route when the limit is exceeded', async () => {
        increment.mockResolvedValue({ totalHits: 11, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 60 })

        await expect(
            guard.canActivate(contextFor(ClosedController, ClosedController.prototype.handle)),
        ).rejects.toBeInstanceOf(ThrottlerException)
    })

    it('does not swallow unrelated storage failures', async () => {
        increment.mockRejectedValue(new TypeError('unexpected'))

        await expect(
            guard.canActivate(contextFor(OpenController, OpenController.prototype.handle)),
        ).rejects.toBeInstanceOf(TypeError)
    })
})
