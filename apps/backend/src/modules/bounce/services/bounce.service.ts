import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, UniqueConstraintError, type OrderItem, type WhereOptions } from 'sequelize'
import { BounceModel } from '../models/bounce.model.js'
import { Bounce, BounceCreate, BouncePage, BounceQuery, BounceType } from '../interfaces/bounce.interface.js'
import { EmailBlockService } from './email-block.service.js'
import { DAY_MS, TRANSIENT_THRESHOLD, TRANSIENT_WINDOW_DAYS } from '../bounce.constants.js'

@Injectable()
export class BounceService {
    private readonly logger = new Logger(BounceService.name)

    constructor(
        @InjectModel(BounceModel) private readonly bounceModel: typeof BounceModel,
        private readonly emailBlockService: EmailBlockService,
    ) {}

    async recordBounce(bounce: BounceCreate): Promise<void> {
        const emailAddress = bounce.emailAddress.toLowerCase()

        let recorded: BounceModel
        try {
            recorded = await this.bounceModel.create({ ...bounce, emailAddress })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                this.logger.debug(`Bounce ${bounce.messageId ?? 'without message id'} already recorded`)
                return
            }
            throw error
        }

        this.logger.log(`Recorded ${bounce.type} bounce #${recorded.bounceId}`)

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

    async getBounces(query: BounceQuery): Promise<BouncePage> {
        const { rows, count } = await this.bounceModel.findAndCountAll({
            where: this.buildFilter(query),
            order: this.buildOrder(query),
            limit: query.itemsPerPage,
            offset: (query.page - 1) * query.itemsPerPage,
        })

        return { items: rows.map((bounce) => bounce.get({ plain: true })), total: count }
    }

    private buildFilter(query: BounceQuery): WhereOptions<Bounce> {
        const conditions: WhereOptions<Bounce>[] = []

        const search = query.search?.trim()
        if (search) {
            const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
            conditions.push({
                [Op.or]: [{ emailAddress: { [Op.iLike]: pattern } }, { reason: { [Op.iLike]: pattern } }],
            })
        }
        if (query.type) {
            conditions.push({ type: query.type })
        }
        if (query.receivedAfter) {
            conditions.push({ receivedAt: { [Op.gt]: query.receivedAfter } })
        }

        return { [Op.and]: conditions }
    }

    private buildOrder(query: BounceQuery): OrderItem[] {
        const direction = query.sortOrder === 'asc' ? 'ASC' : 'DESC'
        const tieBreakers: OrderItem[] = query.sortBy === 'receivedAt' ? [] : [['receivedAt', 'DESC']]

        return [[query.sortBy, direction], ...tieBreakers, ['bounceId', direction]]
    }
}
