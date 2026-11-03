import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Interval } from '@nestjs/schedule'
import { OnOneInstance, WithoutOverlapping } from '@nestjs/locks'
import { literal, Op } from 'sequelize'
import { InboundFormDeliveryModel } from '../models/inbound-form-delivery.model.js'
import { InboundFormDeliveryStatus } from '../interfaces/inbound-form-delivery.interface.js'
import { InboundFormDeliveryQueueService } from './inbound-form-delivery-queue.service.js'
import {
    DELIVERY_BACKOFF_MS,
    DELIVERY_RECOVERY_INTERVAL_MS,
    DELIVERY_STALLED_AFTER_MS,
} from '../inbound-form.constants.js'
import { describeError } from '../../../helpers/describe-error.js'

const RETRY_BACKOFF_SQL = `${DELIVERY_BACKOFF_MS} * CASE WHEN "attempts" = 0 THEN 0 ELSE power(2, "attempts" - 1) END`
const STALLED_BEFORE_RETRY_DUE = literal(
    `"updatedAt" < NOW() - make_interval(secs => (${DELIVERY_STALLED_AFTER_MS} + ${RETRY_BACKOFF_SQL}) / 1000.0)`,
)

@Injectable()
export class InboundFormDeliveryRecoveryService {
    private readonly logger = new Logger(InboundFormDeliveryRecoveryService.name)

    constructor(
        @InjectModel(InboundFormDeliveryModel)
        private readonly deliveryModel: typeof InboundFormDeliveryModel,
        private readonly deliveryQueueService: InboundFormDeliveryQueueService,
    ) {}

    @Interval(DELIVERY_RECOVERY_INTERVAL_MS)
    @OnOneInstance({ key: 'inbound-form:delivery-recovery' })
    @WithoutOverlapping()
    async handleRecoveryInterval(): Promise<void> {
        try {
            const recovered = await this.recoverStalled()
            if (recovered > 0) {
                this.logger.debug(`Queued ${recovered} stalled pending deliveries (existing jobs are kept)`)
            }
        } catch (error) {
            this.logger.error(`Delivery recovery failed: ${describeError(error)}`)
        }
    }

    async recoverStalled(): Promise<number> {
        const stalled = await this.deliveryModel.findAll({
            where: {
                status: InboundFormDeliveryStatus.PENDING,
                [Op.and]: [STALLED_BEFORE_RETRY_DUE],
            },
            attributes: ['inboundFormDeliveryId'],
        })

        for (const { inboundFormDeliveryId } of stalled) {
            await this.deliveryQueueService.enqueue(inboundFormDeliveryId)
        }

        return stalled.length
    }
}
