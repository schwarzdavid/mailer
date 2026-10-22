import { Logger } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { Test, TestingModule } from '@nestjs/testing'
import type { Queue } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DeliveryJobData, InboundFormDeliveryQueueService } from './inbound-form-delivery-queue.service.js'
import { EnqueueTimeoutError } from '../exceptions/enqueue-timeout.error.js'
import {
    DELIVERY_BACKOFF_MS,
    DELIVERY_ENQUEUE_TIMEOUT_MS,
    DELIVERY_JOB,
    DELIVERY_MAX_ATTEMPTS,
    INBOUND_FORM_DELIVERY_QUEUE,
} from '../inbound-form.constants.js'

type DeliveryQueue = Queue<DeliveryJobData>

describe('InboundFormDeliveryQueueService', () => {
    let service: InboundFormDeliveryQueueService
    let add: Mock<(...args: Parameters<DeliveryQueue['add']>) => Promise<unknown>>
    let on: Mock<(event: 'error', listener: (error: Error) => void) => DeliveryQueue>

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        add = vi.fn<typeof add>().mockResolvedValue(undefined)
        on = vi.fn<typeof on>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormDeliveryQueueService,
                { provide: getQueueToken(INBOUND_FORM_DELIVERY_QUEUE), useValue: { add, on } },
            ],
        }).compile()

        service = module.get(InboundFormDeliveryQueueService)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('adds one deduplicated, retried job per delivery', async () => {
        await service.enqueue(7)

        expect(add).toHaveBeenCalledExactlyOnceWith(
            DELIVERY_JOB,
            { inboundFormDeliveryId: 7 },
            {
                jobId: 'delivery-7',
                attempts: DELIVERY_MAX_ATTEMPTS,
                backoff: { type: 'exponential', delay: DELIVERY_BACKOFF_MS },
                removeOnComplete: true,
                removeOnFail: true,
            },
        )
    })

    it('gives up waiting when the queue does not answer in time', async () => {
        vi.useFakeTimers()
        add.mockReturnValue(new Promise<unknown>(() => undefined))

        await Promise.all([
            expect(service.enqueue(7)).rejects.toThrow(
                new EnqueueTimeoutError(`Enqueuing timed out after ${DELIVERY_ENQUEUE_TIMEOUT_MS} ms`),
            ),
            vi.advanceTimersByTimeAsync(DELIVERY_ENQUEUE_TIMEOUT_MS),
        ])
    })

    it('names the timeout so logs can tell it apart', async () => {
        vi.useFakeTimers()
        add.mockReturnValue(new Promise<unknown>(() => undefined))

        const [error] = await Promise.all([
            service.enqueue(7).catch((rejection: unknown) => rejection),
            vi.advanceTimersByTimeAsync(DELIVERY_ENQUEUE_TIMEOUT_MS),
        ])

        expect(error).toBeInstanceOf(EnqueueTimeoutError)
        expect(error).toHaveProperty('name', 'EnqueueTimeoutError')
    })

    it('leaves no unhandled rejection when the queue fails after the timeout won', async () => {
        const unhandledRejection = vi.fn<(reason: unknown) => void>()
        process.on('unhandledRejection', unhandledRejection)
        let rejectAdd: (error: Error) => void = () => undefined
        add.mockReturnValue(
            new Promise<unknown>((_resolve, reject) => {
                rejectAdd = reject
            }),
        )

        try {
            vi.useFakeTimers()
            await Promise.all([
                expect(service.enqueue(7)).rejects.toBeInstanceOf(EnqueueTimeoutError),
                vi.advanceTimersByTimeAsync(DELIVERY_ENQUEUE_TIMEOUT_MS),
            ])
            vi.useRealTimers()

            rejectAdd(new Error('Connection is closed.'))
            await new Promise((resolve) => setImmediate(resolve))

            expect(unhandledRejection).not.toHaveBeenCalled()
        } finally {
            process.off('unhandledRejection', unhandledRejection)
        }
    })

    it('logs queue connection errors without their message', () => {
        const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        const [event, listener] = on.mock.calls[0]!

        listener(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379'), { code: 'ECONNREFUSED' }))

        expect(event).toBe('error')
        expect(logError).toHaveBeenCalledWith('Delivery queue error: Error (code ECONNREFUSED)')
    })
})
