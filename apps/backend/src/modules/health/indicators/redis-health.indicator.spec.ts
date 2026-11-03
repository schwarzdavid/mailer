import { Test } from '@nestjs/testing'
import { HealthIndicatorService } from '@nestjs/terminus'
import type { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { THROTTLER_REDIS_CLIENT } from '../../throttler-storage/throttler-storage.constants.js'
import { HEALTH_TIMEOUT_MS } from '../health.constants.js'
import { RedisHealthIndicator } from './redis-health.indicator.js'

describe('RedisHealthIndicator', () => {
    let indicator: RedisHealthIndicator
    let ping: Mock<() => Promise<'PONG'>>

    beforeEach(async () => {
        ping = vi.fn<() => Promise<'PONG'>>()
        const client: Pick<Redis, 'ping'> = { ping }

        const moduleRef = await Test.createTestingModule({
            providers: [
                RedisHealthIndicator,
                HealthIndicatorService,
                { provide: THROTTLER_REDIS_CLIENT, useValue: client },
            ],
        }).compile()

        indicator = moduleRef.get(RedisHealthIndicator)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('reports up when Redis answers the ping', async () => {
        ping.mockResolvedValue('PONG')

        await expect(indicator.isHealthy('redis')).resolves.toEqual({ redis: { status: 'up' } })
        expect(ping).toHaveBeenCalledOnce()
    })

    it('reports down with the error description when the ping is rejected', async () => {
        ping.mockRejectedValue(
            Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' }),
        )

        await expect(indicator.isHealthy('redis')).resolves.toEqual({
            redis: { status: 'down', message: 'Error (code ECONNREFUSED)' },
        })
    })

    it('reports down once the ping has not settled within the timeout', async () => {
        vi.useFakeTimers()
        ping.mockReturnValue(new Promise<never>(() => {}))

        const result = indicator.isHealthy('redis')
        await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS)

        await expect(result).resolves.toEqual({ redis: { status: 'down', message: 'Timed out after 3000 ms' } })
        expect(vi.getTimerCount()).toBe(0)
    })

    it('clears its timeout once the ping has answered', async () => {
        vi.useFakeTimers()
        ping.mockResolvedValue('PONG')

        await indicator.isHealthy('redis')

        expect(vi.getTimerCount()).toBe(0)
    })
})
