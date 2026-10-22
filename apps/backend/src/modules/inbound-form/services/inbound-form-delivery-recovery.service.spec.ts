import { Logger } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { LocksModule } from '@nestjs/locks'
import { literal, Op, type FindOptions } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormDeliveryRecoveryService } from './inbound-form-delivery-recovery.service.js'
import { InboundFormDeliveryQueueService } from './inbound-form-delivery-queue.service.js'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model.js'
import { InboundFormDelivery, InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface.js'

type StalledDelivery = Pick<InboundFormDelivery, 'inboundFormDeliveryId'>

describe('InboundFormDeliveryRecoveryService', () => {
    let module: TestingModule
    let service: InboundFormDeliveryRecoveryService
    let findAll: Mock<(options: FindOptions<InboundFormDelivery>) => Promise<StalledDelivery[]>>
    let enqueue: Mock<InboundFormDeliveryQueueService['enqueue']>

    beforeEach(async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-10-22T12:00:00.000Z'))
        vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        enqueue = vi.fn<typeof enqueue>().mockResolvedValue(undefined)

        module = await Test.createTestingModule({
            imports: [LocksModule.forRoot()],
            providers: [
                InboundFormDeliveryRecoveryService,
                { provide: getModelToken(InboundFormDeliveryModel), useValue: { findAll } },
                { provide: InboundFormDeliveryQueueService, useValue: { enqueue } },
            ],
        }).compile()
        await module.init()

        service = module.get(InboundFormDeliveryRecoveryService)
    })

    afterEach(async () => {
        await module.close()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('enqueues every pending delivery whose stall window plus retry backoff has passed and returns the count', async () => {
        findAll.mockResolvedValue([{ inboundFormDeliveryId: 3 }, { inboundFormDeliveryId: 8 }])

        await expect(service.recoverStalled()).resolves.toBe(2)

        expect(findAll).toHaveBeenCalledExactlyOnceWith({
            where: {
                status: InboundFormDeliveryStatus.PENDING,
                [Op.and]: [
                    literal(
                        '"updatedAt" < NOW() - make_interval(secs => (120000 + 60000 * CASE WHEN "attempts" = 0 THEN 0 ELSE power(2, "attempts" - 1) END) / 1000.0)',
                    ),
                ],
            },
            attributes: ['inboundFormDeliveryId'],
        })
        expect(enqueue.mock.calls).toEqual([[3], [8]])
    })

    it('enqueues nothing when no delivery is stalled', async () => {
        await expect(service.recoverStalled()).resolves.toBe(0)

        expect(enqueue).not.toHaveBeenCalled()
    })

    it('logs at debug level how many old pending deliveries it queued', async () => {
        const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
        findAll.mockResolvedValue([{ inboundFormDeliveryId: 3 }])

        await service.handleRecoveryInterval()

        expect(debug).toHaveBeenCalledExactlyOnceWith('Queued 1 stalled pending deliveries (existing jobs are kept)')
    })

    it('logs nothing when no delivery is pending for too long', async () => {
        const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)

        await service.handleRecoveryInterval()

        expect(debug).not.toHaveBeenCalled()
    })

    it('logs and swallows an enqueue error from the interval handler', async () => {
        const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        findAll.mockResolvedValue([{ inboundFormDeliveryId: 3 }])
        enqueue.mockRejectedValue(
            Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6379'), { code: 'ECONNREFUSED' }),
        )

        await expect(service.handleRecoveryInterval()).resolves.toBeUndefined()

        expect(logError).toHaveBeenCalledWith('Delivery recovery failed: Error (code ECONNREFUSED)')
    })
})
