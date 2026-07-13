import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, UniqueConstraintError } from 'sequelize'
import { BounceModel } from '../models/bounce.model'
import { Bounce, BounceCreate, BounceType } from '../interfaces/bounce.interface'
import { EmailBlockService } from './email-block.service'
import { DAY_MS, TRANSIENT_THRESHOLD, TRANSIENT_WINDOW_DAYS } from '../bounce.constants'

@Injectable()
export class BounceService {
    private readonly logger = new Logger(BounceService.name)

    constructor(
        @InjectModel(BounceModel) private readonly bounceModel: typeof BounceModel,
        private readonly emailBlockService: EmailBlockService,
    ) {}

    async recordBounce(bounce: BounceCreate): Promise<void> {
        const emailAddress = bounce.emailAddress.toLowerCase()

        try {
            await this.bounceModel.create({ ...bounce, emailAddress })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                this.logger.debug(`Bounce for ${emailAddress} from ${bounce.messageId ?? 'unknown'} already recorded`)
                return
            }
            throw error
        }

        this.logger.log(`Recorded ${bounce.type} bounce for ${emailAddress}: ${bounce.reason}`)

        if (bounce.type === BounceType.PERMANENT) {
            await this.emailBlockService.applyBlock(emailAddress)
            return
        }

        const windowStart = new Date(Date.now() - TRANSIENT_WINDOW_DAYS * DAY_MS)
        const transientCount = await this.bounceModel.count({
            where: {
                emailAddress,
                type: BounceType.TRANSIENT,
                receivedAt: { [Op.gte]: windowStart },
            },
        })

        if (transientCount >= TRANSIENT_THRESHOLD) {
            await this.emailBlockService.applyBlock(emailAddress)
        }
    }

    async getBounces(): Promise<Bounce[]> {
        const bounces = await this.bounceModel.findAll({ order: [['receivedAt', 'DESC']] })

        return bounces.map((bounce) => bounce.get({ plain: true }))
    }
}
