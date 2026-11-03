import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DeliveryJob, InboundFormDeliveryProcessor } from './inbound-form-delivery.processor.js'
import { InboundFormDeliveryService } from '../services/inbound-form-delivery.service.js'
import { DELIVERY_MAX_ATTEMPTS } from '../inbound-form.constants.js'

describe('InboundFormDeliveryProcessor', () => {
    let processor: InboundFormDeliveryProcessor
    let deliver: Mock<InboundFormDeliveryService['deliver']>

    function deliveryJob(attemptsMade: number): DeliveryJob {
        return { data: { inboundFormDeliveryId: 7 }, attemptsMade, opts: { attempts: DELIVERY_MAX_ATTEMPTS } }
    }

    beforeEach(async () => {
        deliver = vi.fn<InboundFormDeliveryService['deliver']>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            providers: [InboundFormDeliveryProcessor, { provide: InboundFormDeliveryService, useValue: { deliver } }],
        }).compile()

        processor = module.get(InboundFormDeliveryProcessor)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.each<[number, boolean]>([
        [0, false],
        [6, false],
        [7, true],
    ])('passes the delivery id with isLastAttempt after %i finished attempts', async (attemptsMade, isLast) => {
        await processor.process(deliveryJob(attemptsMade))

        expect(deliver).toHaveBeenCalledExactlyOnceWith(7, isLast)
    })

    it('treats a job without retries as its own last attempt', async () => {
        await processor.process({ data: { inboundFormDeliveryId: 7 }, attemptsMade: 0, opts: {} })

        expect(deliver).toHaveBeenCalledExactlyOnceWith(7, true)
    })

    it('propagates a delivery error so the queue schedules the retry', async () => {
        const error = new Error('relay busy')
        deliver.mockRejectedValue(error)

        await expect(processor.process(deliveryJob(0))).rejects.toBe(error)
    })

    it('logs worker errors without their message', () => {
        const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        processor.onWorkerError(
            Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379'), { code: 'ECONNREFUSED' }),
        )

        expect(logError).toHaveBeenCalledWith('Delivery worker error: Error (code ECONNREFUSED)')
    })
})
