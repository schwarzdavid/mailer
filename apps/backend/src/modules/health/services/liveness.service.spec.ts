import { Test } from '@nestjs/testing'
import { TerminusModule, type HealthIndicatorResult } from '@nestjs/terminus'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { LIVENESS_CACHE_MS } from '../health.constants.js'
import { DatabaseHealthIndicator } from '../indicators/database-health.indicator.js'
import { LivenessService } from './liveness.service.js'

describe('LivenessService', () => {
    let liveness: LivenessService
    let database: Mock<DatabaseHealthIndicator['isHealthy']>

    const up = (key: string): Promise<HealthIndicatorResult> => Promise.resolve({ [key]: { status: 'up' } })

    beforeEach(async () => {
        vi.useFakeTimers()
        database = vi.fn<DatabaseHealthIndicator['isHealthy']>(up)

        const moduleRef = await Test.createTestingModule({
            imports: [TerminusModule.forRoot({ logger: false })],
            providers: [LivenessService, { provide: DatabaseHealthIndicator, useValue: { isHealthy: database } }],
        }).compile()

        liveness = moduleRef.get(LivenessService)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('checks only the database', async () => {
        await expect(liveness.check()).resolves.toMatchObject({
            status: 'ok',
            details: { database: { status: 'up' } },
        })
        expect(database).toHaveBeenCalledExactlyOnceWith('database')
    })

    it('shares one in-flight run between concurrent callers', async () => {
        let answer: (result: HealthIndicatorResult) => void = () => {}
        database.mockReturnValueOnce(new Promise<HealthIndicatorResult>((resolve) => (answer = resolve)))

        const first = liveness.check()
        const second = liveness.check()
        answer({ database: { status: 'up' } })

        const results = await Promise.all([first, second])
        expect(results[1]).toBe(results[0])
        expect(database).toHaveBeenCalledOnce()
    })

    it('answers from the cache within the liveness cache period and runs again after it', async () => {
        const first = await liveness.check()
        await vi.advanceTimersByTimeAsync(LIVENESS_CACHE_MS - 1)

        await expect(liveness.check()).resolves.toBe(first)
        expect(database).toHaveBeenCalledOnce()

        await vi.advanceTimersByTimeAsync(1)
        await expect(liveness.check()).resolves.not.toBe(first)
        expect(database).toHaveBeenCalledTimes(2)
    })
})
