import { Logger, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Op } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { EmailBlockService } from './email-block.service'
import { EmailBlockModel } from '../models/email-block.model'
import { EmailBlock } from '../interfaces/email-block.interface'
import { EmailBlockedException } from '../exceptions/email-blocked.exception'
import { DAY_MS } from '../bounce.constants'

const now = new Date('2026-07-13T12:00:00.000Z')

type BlockRow = EmailBlock & {
    get: (options: { plain: true }) => EmailBlock
    update: Mock<(values: Partial<EmailBlock>) => Promise<BlockRow>>
}

function blockRow(partial: Partial<EmailBlock> = {}): BlockRow {
    let plain: EmailBlock = {
        emailBlockId: 5,
        emailAddress: 'user@example.com',
        blockCount: 0,
        blockedUntil: null,
        createdAt: now,
        updatedAt: now,
        ...partial,
    }
    const row: BlockRow = {
        ...plain,
        get: () => plain,
        update: vi.fn<BlockRow['update']>(),
    }
    row.update.mockImplementation((values) => {
        plain = { ...plain, ...values }
        return Promise.resolve(row)
    })
    return row
}

describe('EmailBlockService', () => {
    let service: EmailBlockService
    let findOrCreate: Mock<(typeof EmailBlockModel)['findOrCreate']>
    let findOne: Mock<(typeof EmailBlockModel)['findOne']>
    let findAll: Mock<(typeof EmailBlockModel)['findAll']>
    let findByPk: Mock<(typeof EmailBlockModel)['findByPk']>

    beforeEach(async () => {
        vi.useFakeTimers()
        vi.setSystemTime(now)
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        findOrCreate = vi.fn<typeof findOrCreate>()
        findOne = vi.fn<typeof findOne>().mockResolvedValue(null)
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        findByPk = vi.fn<typeof findByPk>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmailBlockService,
                {
                    provide: getModelToken(EmailBlockModel),
                    useValue: { findOrCreate, findOne, findAll, findByPk },
                },
            ],
        }).compile()

        service = module.get(EmailBlockService)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('applyBlock', () => {
        it('blocks a first-time bouncer for 7 days', async () => {
            const row = blockRow()
            findOrCreate.mockResolvedValue([row as unknown as EmailBlockModel, true])

            const result = await service.applyBlock('User@Example.com')

            expect(findOrCreate).toHaveBeenCalledWith({
                where: { emailAddress: 'user@example.com' },
                defaults: { emailAddress: 'user@example.com' },
            })
            expect(row.update).toHaveBeenCalledWith({
                blockCount: 1,
                blockedUntil: new Date(now.getTime() + 7 * DAY_MS),
            })
            expect(result.blockCount).toBe(1)
        })

        it('escalates along the ladder for repeat offenders', async () => {
            const row = blockRow({ blockCount: 2, blockedUntil: new Date(now.getTime() - DAY_MS) })
            findOrCreate.mockResolvedValue([row as unknown as EmailBlockModel, false])

            await service.applyBlock('user@example.com')

            expect(row.update).toHaveBeenCalledWith({
                blockCount: 3,
                blockedUntil: new Date(now.getTime() + 90 * DAY_MS),
            })
        })

        it('caps the duration at the top of the ladder', async () => {
            const row = blockRow({ blockCount: 9, blockedUntil: new Date(now.getTime() - DAY_MS) })
            findOrCreate.mockResolvedValue([row as unknown as EmailBlockModel, false])

            await service.applyBlock('user@example.com')

            expect(row.update).toHaveBeenCalledWith({
                blockCount: 10,
                blockedUntil: new Date(now.getTime() + 365 * DAY_MS),
            })
        })

        it('does not escalate while a block is still active', async () => {
            const blockedUntil = new Date(now.getTime() + DAY_MS)
            const row = blockRow({ blockCount: 1, blockedUntil })
            findOrCreate.mockResolvedValue([row as unknown as EmailBlockModel, false])

            const result = await service.applyBlock('user@example.com')

            expect(row.update).not.toHaveBeenCalled()
            expect(result.blockedUntil).toEqual(blockedUntil)
        })
    })

    describe('assertNotBlocked', () => {
        it('throws for an actively blocked address', async () => {
            const blockedUntil = new Date(now.getTime() + DAY_MS)
            findOne.mockResolvedValue(blockRow({ blockCount: 1, blockedUntil }) as unknown as EmailBlockModel)

            await expect(service.assertNotBlocked('User@Example.com')).rejects.toThrow(EmailBlockedException)
            expect(findOne).toHaveBeenCalledWith({
                where: { emailAddress: 'user@example.com', blockedUntil: { [Op.gt]: now } },
            })
        })

        it('resolves when the address is not blocked', async () => {
            await expect(service.assertNotBlocked('user@example.com')).resolves.toBeUndefined()
        })
    })

    describe('getBlockedAddresses', () => {
        it('returns active blocks as plain rows', async () => {
            const blockedUntil = new Date(now.getTime() + DAY_MS)
            findAll.mockResolvedValue([blockRow({ blockCount: 2, blockedUntil }) as unknown as EmailBlockModel])

            const result = await service.getBlockedAddresses()

            expect(findAll).toHaveBeenCalledWith({
                where: { blockedUntil: { [Op.gt]: now } },
                order: [['blockedUntil', 'DESC']],
            })
            expect(result).toEqual([expect.objectContaining({ emailAddress: 'user@example.com', blockCount: 2 })])
        })
    })

    describe('unblock', () => {
        it('clears blockedUntil but keeps the block count', async () => {
            const row = blockRow({ blockCount: 3, blockedUntil: new Date(now.getTime() + DAY_MS) })
            findByPk.mockResolvedValue(row as unknown as EmailBlockModel)

            const result = await service.unblock(5)

            expect(findByPk).toHaveBeenCalledWith(5)
            expect(row.update).toHaveBeenCalledWith({ blockedUntil: null })
            expect(result.blockCount).toBe(3)
            expect(result.blockedUntil).toBeNull()
        })

        it('throws NotFound for an unknown id', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.unblock(99)).rejects.toThrow(NotFoundException)
        })
    })
})
