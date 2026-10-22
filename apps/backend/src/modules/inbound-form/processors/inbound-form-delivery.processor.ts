import { Logger } from '@nestjs/common'
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import { InboundFormDeliveryService } from '../services/inbound-form-delivery.service.js'
import { DeliveryJobData } from '../services/inbound-form-delivery-queue.service.js'
import { DELIVERY_WORKER_CONCURRENCY, INBOUND_FORM_DELIVERY_QUEUE } from '../inbound-form.constants.js'
import { describeError } from '../../../helpers/describe-error.js'

export type DeliveryJob = Pick<Job<DeliveryJobData>, 'data' | 'attemptsMade' | 'opts'>

@Processor(INBOUND_FORM_DELIVERY_QUEUE, { concurrency: DELIVERY_WORKER_CONCURRENCY })
export class InboundFormDeliveryProcessor extends WorkerHost {
    private readonly logger = new Logger(InboundFormDeliveryProcessor.name)

    constructor(private readonly deliveryService: InboundFormDeliveryService) {
        super()
    }

    async process(job: DeliveryJob): Promise<void> {
        await this.deliveryService.deliver(
            job.data.inboundFormDeliveryId,
            job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        )
    }

    @OnWorkerEvent('error')
    onWorkerError(error: Error): void {
        this.logger.error(`Delivery worker error: ${describeError(error)}`)
    }
}
