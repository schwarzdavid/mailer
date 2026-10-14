import { Logger } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Op, UniqueConstraintError, type FindAndCountOptions } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { BounceService } from './bounce.service.js'
import { EmailBlockService } from './email-block.service.js'
import { BounceModel } from '../models/bounce.model.js'
import { Bounce, BounceCreate, BounceQuery, BounceType } from '../interfaces/bounce.interface.js'
import { DAY_MS } from '../bounce.constants.js'

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
    let findAndCountAll: Mock<(options: FindAndCountOptions<Bounce>) => Promise<{ rows: BounceRow[]; count: number }>>
    let applyBlock: Mock<EmailBlockService['applyBlock']>

    beforeEach(async () => {
        vi.useFakeTimers()
        vi.setSystemTime(now)
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)

        create = vi.fn<typeof create>().mockResolvedValue(bounceRow())
        count = vi.fn<typeof count>().mockResolvedValue(1)
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        findAndCountAll = vi.fn<typeof findAndCountAll>().mockResolvedValue({ rows: [], count: 0 })
        applyBlock = vi.fn<typeof applyBlock>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BounceService,
                { provide: getModelToken(BounceModel), useValue: { create, count, findAll, findAndCountAll } },
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
        const defaultQuery: BounceQuery = { page: 1, itemsPerPage: 25, sortBy: 'receivedAt', sortOrder: 'desc' }

        it('returns the first page of plain rows, newest first, with the total', async () => {
            findAndCountAll.mockResolvedValue({ rows: [bounceRow()], count: 41 })

            const result = await service.getBounces(defaultQuery)

            expect(findAndCountAll).toHaveBeenCalledWith({
                where: { [Op.and]: [] },
                order: [
                    ['receivedAt', 'DESC'],
                    ['bounceId', 'DESC'],
                ],
                limit: 25,
                offset: 0,
            })
            expect(result).toEqual({
                items: [expect.objectContaining({ emailAddress: 'missing@example.org' })],
                total: 41,
            })
        })

        it('offsets by the requested page', async () => {
            await service.getBounces({ ...defaultQuery, page: 3, itemsPerPage: 10 })

            expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }))
        })

        it('searches address and reason case-insensitively with escaped wildcards', async () => {
            await service.getBounces({ ...defaultQuery, search: '  100%_off\\ ' })

            const pattern = '%100\\%\\_off\\\\%'
            expect(findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        [Op.and]: [
                            {
                                [Op.or]: [
                                    { emailAddress: { [Op.iLike]: pattern } },
                                    { reason: { [Op.iLike]: pattern } },
                                ],
                            },
                        ],
                    },
                }),
            )
        })

        it('ignores a blank search', async () => {
            await service.getBounces({ ...defaultQuery, search: '   ' })

            expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ where: { [Op.and]: [] } }))
        })

        it('filters by type and received-after timestamp', async () => {
            const receivedAfter = new Date('2026-07-01T00:00:00.000Z')

            await service.getBounces({ ...defaultQuery, type: BounceType.TRANSIENT, receivedAfter })

            expect(findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        [Op.and]: [{ type: BounceType.TRANSIENT }, { receivedAt: { [Op.gt]: receivedAfter } }],
                    },
                }),
            )
        })

        it('sorts by type with the newest bounce breaking ties', async () => {
            await service.getBounces({ ...defaultQuery, sortBy: 'type', sortOrder: 'asc' })

            expect(findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    order: [
                        ['type', 'ASC'],
                        ['receivedAt', 'DESC'],
                        ['bounceId', 'ASC'],
                    ],
                }),
            )
        })

        it('sorts by received date ascending', async () => {
            await service.getBounces({ ...defaultQuery, sortOrder: 'asc' })

            expect(findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    order: [
                        ['receivedAt', 'ASC'],
                        ['bounceId', 'ASC'],
                    ],
                }),
            )
        })
    })
})
