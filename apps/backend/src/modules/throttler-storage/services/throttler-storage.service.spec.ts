import { Test } from '@nestjs/testing'
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis'
import type { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ThrottlerStorageUnavailableError } from '../exceptions/throttler-storage-unavailable.error.js'
import { THROTTLER_REDIS_CLIENT } from '../throttler-storage.constants.js'
import { ThrottlerStorageService } from './throttler-storage.service.js'

type ClientDouble = Pick<Redis, 'status' | 'disconnect'>

describe('ThrottlerStorageService', () => {
    let storage: ThrottlerStorageService
    let increment: Mock<ThrottlerStorageRedisService['increment']>
    let disconnect: Mock<Redis['disconnect']>
    let client: ClientDouble

    beforeEach(async () => {
        increment = vi.fn<ThrottlerStorageRedisService['increment']>()
        disconnect = vi.fn<Redis['disconnect']>()
        client = { status: 'ready', disconnect }

        const moduleRef = await Test.createTestingModule({
            providers: [
                ThrottlerStorageService,
                { provide: ThrottlerStorageRedisService, useValue: { increment } },
                { provide: THROTTLER_REDIS_CLIENT, useValue: client },
            ],
        }).compile()

        storage = moduleRef.get(ThrottlerStorageService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('increment', () => {
        it('delegates to the Redis storage and returns its record', async () => {
            const record = { totalHits: 11, timeToExpire: 42, isBlocked: true, timeToBlockExpire: 300 }
            increment.mockResolvedValue(record)

            await expect(storage.increment('tracker-hash', 60_000, 10, 300_000, 'default')).resolves.toEqual(record)
            expect(increment).toHaveBeenCalledExactlyOnceWith('tracker-hash', 60_000, 10, 300_000, 'default')
        })

        it('rejects with ThrottlerStorageUnavailableError when Redis rejects the command', async () => {
            increment.mockRejectedValue(new Error("Stream isn't writeable and enableOfflineQueue options is false"))

            const failure = storage.increment('key', 60_000, 10, 60_000, 'default')

            await expect(failure).rejects.toBeInstanceOf(ThrottlerStorageUnavailableError)
            await expect(failure).rejects.toThrow(
                "Redis throttler storage unavailable: Stream isn't writeable and enableOfflineQueue options is false",
            )
        })

        it('rejects with ThrottlerStorageUnavailableError when the storage rejects an unexpected reply', async () => {
            increment.mockRejectedValue(new TypeError('Expected totalHits to be a number'))

            await expect(storage.increment('key', 60_000, 10, 60_000, 'default')).rejects.toBeInstanceOf(
                ThrottlerStorageUnavailableError,
            )
        })
    })

    describe('onApplicationShutdown', () => {
        it('disconnects the Redis client', () => {
            storage.onApplicationShutdown()

            expect(disconnect).toHaveBeenCalledOnce()
        })

        it('leaves an already closed client alone', () => {
            client.status = 'end'

            storage.onApplicationShutdown()

            expect(disconnect).not.toHaveBeenCalled()
        })
    })
})
