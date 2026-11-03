import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { describeError } from '../../../helpers/describe-error.js'
import { EnqueueTimeoutError } from '../exceptions/enqueue-timeout.error.js'
import {
    DELIVERY_BACKOFF_MS,
    DELIVERY_ENQUEUE_TIMEOUT_MS,
    DELIVERY_JOB,
    DELIVERY_MAX_ATTEMPTS,
    INBOUND_FORM_DELIVERY_QUEUE,
} from '../inbound-form.constants.js'

export interface DeliveryJobData {
    inboundFormDeliveryId: number
}

@Injectable()
export class InboundFormDeliveryQueueService {
    private readonly logger = new Logger(InboundFormDeliveryQueueService.name)

    constructor(@InjectQueue(INBOUND_FORM_DELIVERY_QUEUE) private readonly queue: Queue<DeliveryJobData>) {
        this.queue.on('error', (error) => this.logger.error(`Delivery queue error: ${describeError(error)}`))
    }

    async enqueue(inboundFormDeliveryId: number): Promise<void> {
        // BullMQ waits for its Redis connection without a deadline, so during a Redis
        // outage an unbounded add would hang the form submission that enqueues it.
        let timer: NodeJS.Timeout | undefined
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
                () => reject(new EnqueueTimeoutError(`Enqueuing timed out after ${DELIVERY_ENQUEUE_TIMEOUT_MS} ms`)),
                DELIVERY_ENQUEUE_TIMEOUT_MS,
            )
        })

        try {
            await Promise.race([
                this.queue.add(
                    DELIVERY_JOB,
                    { inboundFormDeliveryId },
                    {
                        jobId: `delivery-${inboundFormDeliveryId}`,
                        attempts: DELIVERY_MAX_ATTEMPTS,
                        backoff: { type: 'exponential', delay: DELIVERY_BACKOFF_MS },
                        removeOnComplete: true,
                        removeOnFail: true,
                    },
                ),
                timeout,
            ])
        } finally {
            clearTimeout(timer)
        }
    }
}
