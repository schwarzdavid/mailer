import { Test } from '@nestjs/testing'
import { getConnectionToken } from '@nestjs/sequelize'
import { HealthIndicatorService } from '@nestjs/terminus'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { HEALTH_TIMEOUT_MS } from '../health.constants.js'
import { DatabaseHealthIndicator, type QueryableConnection } from './database-health.indicator.js'

describe('DatabaseHealthIndicator', () => {
    let indicator: DatabaseHealthIndicator
    let query: Mock<QueryableConnection['query']>

    beforeEach(async () => {
        query = vi.fn<QueryableConnection['query']>()
        const connection: QueryableConnection = { query }

        const moduleRef = await Test.createTestingModule({
            providers: [
                DatabaseHealthIndicator,
                HealthIndicatorService,
                { provide: getConnectionToken(), useValue: connection },
            ],
        }).compile()

        indicator = moduleRef.get(DatabaseHealthIndicator)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('reports up when the database answers SELECT 1', async () => {
        query.mockResolvedValue([[{ '?column?': 1 }], null])

        await expect(indicator.isHealthy('database')).resolves.toEqual({ database: { status: 'up' } })
        expect(query).toHaveBeenCalledExactlyOnceWith('SELECT 1')
    })

    it('reports down with the error name only, never the driver message', async () => {
        query.mockRejectedValue(
            Object.assign(new Error('password authentication failed for user "mailer"'), {
                name: 'SequelizeConnectionError',
            }),
        )

        const result = await indicator.isHealthy('database')

        expect(result).toEqual({ database: { status: 'down', message: 'SequelizeConnectionError' } })
        expect(JSON.stringify(result)).not.toContain('mailer')
    })

    it('reports down once the query has not settled within the timeout', async () => {
        vi.useFakeTimers()
        query.mockReturnValue(new Promise<never>(() => {}))

        const result = indicator.isHealthy('database')
        await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS)

        await expect(result).resolves.toEqual({ database: { status: 'down', message: 'Timed out after 3000 ms' } })
        expect(vi.getTimerCount()).toBe(0)
    })
})
