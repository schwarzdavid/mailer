import { Logger } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Op, UniqueConstraintError } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { BounceService } from './bounce.service'
import { EmailBlockService } from './email-block.service'
import { BounceModel } from '../models/bounce.model'
import { Bounce, BounceCreate, BounceType } from '../interfaces/bounce.interface'
import { DAY_MS } from '../bounce.constants'

const now = new Date('2026-07-13T12:00:00.000Z')

const permanentBounce: BounceCreate = {
    emailAddress: 'Missing@Example.org',
    type: BounceType.PERMANENT,
    statusCode: '5.1.1',
    reason: 'User unknown',
    messageId: '<dsn-1@relay.example.com>',
    receivedAt: now,
}

const transientBounce: BounceCreate = {
    ...permanentBounce,
    type: BounceType.TRANSIENT,
    statusCode: '4.2.2',
    reason: 'Mailbox full',
}

type BounceRow = Bounce & { get: (options: { plain: true }) => Bounce }

function bounceRow(partial: Partial<Bounce> = {}): BounceRow {
    const plain: Bounce = {
        bounceId: 1,
        emailAddress: 'missing@example.org',
        type: BounceType.PERMANENT,
        statusCode: '5.1.1',
        reason: 'User unknown',
        messageId: '<dsn-1@relay.example.com>',
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
        ...partial,
    }
    return { ...plain, get: () => plain }
}

describe('BounceService', () => {
    let service: BounceService
    let create: Mock<(typeof BounceModel)['create']>
    let count: Mock<(typeof BounceModel)['count']>
    let findAll: Mock<(typeof BounceModel)['findAll']>
    let applyBlock: Mock<EmailBlockService['applyBlock']>

    beforeEach(async () => {
        vi.useFakeTimers()
        vi.setSystemTime(now)
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)

        create = vi.fn<typeof create>().mockResolvedValue(bounceRow())
        count = vi.fn<typeof count>().mockResolvedValue(1)
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        applyBlock = vi.fn<typeof applyBlock>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BounceService,
                { provide: getModelToken(BounceModel), useValue: { create, count, findAll } },
                { provide: EmailBlockService, useValue: { applyBlock } },
            ],
        }).compile()

        service = module.get(BounceService)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('recordBounce', () => {
        it('stores the bounce with a lowercased address and blocks on permanent bounces', async () => {
            await service.recordBounce(permanentBounce)

            expect(create).toHaveBeenCalledWith({ ...permanentBounce, emailAddress: 'missing@example.org' })
            expect(applyBlock).toHaveBeenCalledWith('missing@example.org')
            expect(count).not.toHaveBeenCalled()
        })

        it('silently skips a bounce that was already recorded', async () => {
            create.mockRejectedValue(new UniqueConstraintError({}))

            await service.recordBounce(permanentBounce)

            expect(applyBlock).not.toHaveBeenCalled()
        })

        it('rethrows unexpected persistence errors', async () => {
            create.mockRejectedValue(new Error('connection lost'))

            await expect(service.recordBounce(permanentBounce)).rejects.toThrow('connection lost')
        })

        it('does not block below the transient threshold', async () => {
            count.mockResolvedValue(2)

            await service.recordBounce(transientBounce)

            expect(count).toHaveBeenCalledWith({
                where: {
                    emailAddress: 'missing@example.org',
                    type: BounceType.TRANSIENT,
                    receivedAt: { [Op.gte]: new Date(now.getTime() - 7 * DAY_MS) },
                },
            })
            expect(applyBlock).not.toHaveBeenCalled()
        })

        it('blocks once the transient threshold is reached', async () => {
            count.mockResolvedValue(3)

            await service.recordBounce(transientBounce)

            expect(applyBlock).toHaveBeenCalledWith('missing@example.org')
        })
    })

    describe('getBounces', () => {
        it('returns bounces as plain rows, newest first', async () => {
            findAll.mockResolvedValue([bounceRow() as unknown as BounceModel])

            const result = await service.getBounces()

            expect(findAll).toHaveBeenCalledWith({ order: [['receivedAt', 'DESC']] })
            expect(result).toEqual([expect.objectContaining({ emailAddress: 'missing@example.org' })])
        })
    })
})
