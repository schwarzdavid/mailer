import { ServiceUnavailableException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { TerminusModule, type HealthIndicatorResult } from '@nestjs/terminus'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { READINESS_CACHE_MS } from '../health.constants.js'
import { DatabaseHealthIndicator } from '../indicators/database-health.indicator.js'
import { RedisHealthIndicator } from '../indicators/redis-health.indicator.js'
import { SmtpHealthIndicator } from '../indicators/smtp-health.indicator.js'
import { ReadinessService } from './readiness.service.js'

describe('ReadinessService', () => {
    let readiness: ReadinessService
    let database: Mock<DatabaseHealthIndicator['isHealthy']>
    let redis: Mock<RedisHealthIndicator['isHealthy']>
    let smtp: Mock<SmtpHealthIndicator['isHealthy']>

    const up = (key: string): Promise<HealthIndicatorResult> => Promise.resolve({ [key]: { status: 'up' } })

    beforeEach(async () => {
        vi.useFakeTimers()
        database = vi.fn<DatabaseHealthIndicator['isHealthy']>(up)
        redis = vi.fn<RedisHealthIndicator['isHealthy']>(up)
        smtp = vi.fn<SmtpHealthIndicator['isHealthy']>(up)

        const moduleRef = await Test.createTestingModule({
            imports: [TerminusModule.forRoot({ logger: false })],
            providers: [
                ReadinessService,
                { provide: DatabaseHealthIndicator, useValue: { isHealthy: database } },
                { provide: RedisHealthIndicator, useValue: { isHealthy: redis } },
                { provide: SmtpHealthIndicator, useValue: { isHealthy: smtp } },
            ],
        }).compile()

        readiness = moduleRef.get(ReadinessService)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    function expectRuns(count: number): void {
        expect(database).toHaveBeenCalledTimes(count)
        expect(redis).toHaveBeenCalledTimes(count)
        expect(smtp).toHaveBeenCalledTimes(count)
    }

    it('checks the database, Redis and SMTP', async () => {
        await expect(readiness.check()).resolves.toMatchObject({
            status: 'ok',
            details: { database: { status: 'up' }, redis: { status: 'up' }, smtp: { status: 'up' } },
        })
        expect(database).toHaveBeenCalledExactlyOnceWith('database')
        expect(redis).toHaveBeenCalledExactlyOnceWith('redis')
        expect(smtp).toHaveBeenCalledExactlyOnceWith('smtp')
    })

    it('shares one in-flight run between concurrent callers', async () => {
        let answer: (result: HealthIndicatorResult) => void = () => {}
        smtp.mockReturnValueOnce(new Promise<HealthIndicatorResult>((resolve) => (answer = resolve)))

        const first = readiness.check()
        const second = readiness.check()
        answer({ smtp: { status: 'up' } })

        const results = await Promise.all([first, second])
        expect(results[1]).toBe(results[0])
        expectRuns(1)
    })

    it('answers from the cache until the cache period has passed', async () => {
        const first = await readiness.check()
        await vi.advanceTimersByTimeAsync(READINESS_CACHE_MS - 1)

        await expect(readiness.check()).resolves.toBe(first)
        expectRuns(1)
    })

    it('runs the checks again once the cache period has passed', async () => {
        const first = await readiness.check()
        await vi.advanceTimersByTimeAsync(READINESS_CACHE_MS)

        const second = await readiness.check()
        expect(second).not.toBe(first)
        expectRuns(2)
    })

    it('caches a failing run and rethrows its 503 to later callers', async () => {
        smtp.mockResolvedValueOnce({ smtp: { status: 'down', message: 'Error (code ENOTFOUND)' } })

        const failure = await readiness.check().catch((error: unknown) => error)
        expect(failure).toBeInstanceOf(ServiceUnavailableException)

        await expect(readiness.check()).rejects.toBe(failure)
        expectRuns(1)

        await vi.advanceTimersByTimeAsync(READINESS_CACHE_MS)
        await expect(readiness.check()).resolves.toMatchObject({ status: 'ok' })
        expectRuns(2)
    })
})
