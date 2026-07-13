import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op } from 'sequelize'
import { EmailBlockModel } from '../models/email-block.model'
import { EmailBlock } from '../interfaces/email-block.interface'
import { EmailBlockedException } from '../exceptions/email-blocked.exception'
import { BLOCK_LADDER_DAYS, DAY_MS } from '../bounce.constants'

@Injectable()
export class EmailBlockService {
    private readonly logger = new Logger(EmailBlockService.name)

    constructor(@InjectModel(EmailBlockModel) private readonly emailBlockModel: typeof EmailBlockModel) {}

    async applyBlock(emailAddress: string): Promise<EmailBlock> {
        const address = emailAddress.toLowerCase()
        const [row] = await this.emailBlockModel.findOrCreate({
            where: { emailAddress: address },
            defaults: { emailAddress: address },
        })

        const block = row.get({ plain: true })
        if (block.blockedUntil && block.blockedUntil > new Date()) {
            return block
        }

        const blockCount = block.blockCount + 1
        const days = BLOCK_LADDER_DAYS[Math.min(blockCount, BLOCK_LADDER_DAYS.length) - 1] ?? 365
        const blockedUntil = new Date(Date.now() + days * DAY_MS)

        await row.update({ blockCount, blockedUntil })
        this.logger.log(`Blocked ${address} until ${blockedUntil.toISOString()} (block #${blockCount})`)

        return row.get({ plain: true })
    }

    async assertNotBlocked(emailAddress: string): Promise<void> {
        const row = await this.emailBlockModel.findOne({
            where: { emailAddress: emailAddress.toLowerCase(), blockedUntil: { [Op.gt]: new Date() } },
        })

        const block = row?.get({ plain: true })
        if (block?.blockedUntil) {
            throw new EmailBlockedException(block.emailAddress, block.blockedUntil)
        }
    }

    async getBlockedAddresses(): Promise<EmailBlock[]> {
        const rows = await this.emailBlockModel.findAll({
            where: { blockedUntil: { [Op.gt]: new Date() } },
            order: [['blockedUntil', 'DESC']],
        })

        return rows.map((row) => row.get({ plain: true }))
    }

    async unblock(emailBlockId: number): Promise<EmailBlock> {
        const row = await this.emailBlockModel.findByPk(emailBlockId)
        if (!row) {
            throw new NotFoundException('Unknown email block')
        }

        await row.update({ blockedUntil: null })
        this.logger.log(`Unblocked ${row.emailAddress}`)

        return row.get({ plain: true })
    }
}
