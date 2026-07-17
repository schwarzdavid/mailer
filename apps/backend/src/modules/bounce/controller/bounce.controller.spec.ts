import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { BounceController } from './bounce.controller'
import { BounceService } from '../services/bounce.service'
import { EmailBlockService } from '../services/email-block.service'
import { PoliciesGuard } from '../../permission/guards/policies.guard'
import { Bounce, BounceType } from '../interfaces/bounce.interface'
import { EmailBlock } from '../interfaces/email-block.interface'

const bounce: Bounce = {
    bounceId: 1,
    emailAddress: 'missing@example.org',
    type: BounceType.PERMANENT,
    statusCode: '5.1.1',
    reason: 'User unknown',
    messageId: '<dsn-1@relay.example.com>',
    receivedAt: new Date('2026-07-13T10:00:00.000Z'),
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
}

const block: EmailBlock = {
    emailBlockId: 5,
    emailAddress: 'missing@example.org',
    blockCount: 2,
    blockedUntil: new Date('2026-08-13T10:00:00.000Z'),
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
}

describe('BounceController', () => {
    let controller: BounceController
    let getBounces: Mock<BounceService['getBounces']>
    let getBlockedAddresses: Mock<EmailBlockService['getBlockedAddresses']>
    let unblock: Mock<EmailBlockService['unblock']>

    beforeEach(async () => {
        getBounces = vi.fn<typeof getBounces>().mockResolvedValue([bounce])
        getBlockedAddresses = vi.fn<typeof getBlockedAddresses>().mockResolvedValue([block])
        unblock = vi.fn<typeof unblock>().mockResolvedValue({ ...block, blockedUntil: null })

        const module: TestingModule = await Test.createTestingModule({
            controllers: [BounceController],
            providers: [
                { provide: BounceService, useValue: { getBounces } },
                { provide: EmailBlockService, useValue: { getBlockedAddresses, unblock } },
            ],
        })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
            .compile()

        controller = module.get(BounceController)
    })

    it('lists bounce events', async () => {
        const result = await controller.getBounces()

        expect(getBounces).toHaveBeenCalledOnce()
        expect(result).toEqual([expect.objectContaining({ emailAddress: 'missing@example.org' })])
    })

    it('lists blocked addresses', async () => {
        const result = await controller.getBlockedAddresses()

        expect(getBlockedAddresses).toHaveBeenCalledOnce()
        expect(result).toEqual([expect.objectContaining({ blockCount: 2 })])
    })

    it('unblocks by id', async () => {
        const result = await controller.unblock(5)

        expect(unblock).toHaveBeenCalledWith(5)
        expect(result.blockedUntil).toBeNull()
    })
})
