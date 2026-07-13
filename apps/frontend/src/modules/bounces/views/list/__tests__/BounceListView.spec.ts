import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type BounceDto, type EmailBlockDto } from 'api'
import BounceListView from '../BounceListView.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const bounces: BounceDto[] = [
    {
        bounceId: 1,
        emailAddress: 'missing@example.org',
        type: 'permanent',
        statusCode: '5.1.1',
        reason: 'User unknown',
        receivedAt: new Date('2026-07-13T10:00:00.000Z'),
    },
    {
        bounceId: 2,
        emailAddress: 'full@example.org',
        type: 'transient',
        statusCode: '4.2.2',
        reason: 'Mailbox full',
        receivedAt: new Date('2026-07-12T10:00:00.000Z'),
    },
]

const blocked: EmailBlockDto[] = [
    {
        emailBlockId: 5,
        emailAddress: 'missing@example.org',
        blockCount: 2,
        blockedUntil: new Date('2026-08-13T10:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('BounceListView', () => {
    it('lists bounce events with type and reason', async () => {
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(bounces)
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const wrapper = mountView(BounceListView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('missing@example.org')
        })
        expect(wrapper.text()).toContain('User unknown')
        expect(wrapper.text()).toContain('Permanent')
        expect(wrapper.text()).toContain('Transient')
        expect(wrapper.get('h1').text()).toBe('Bounces')
    })

    it('unblocks an address from the blocked tab', async () => {
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(bounces)
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const unblock = vi.spyOn(BounceApi, 'unblock').mockResolvedValue({ ...blocked[0]!, blockedUntil: null })
        const wrapper = mountView(BounceListView)

        const blockedTab = wrapper.findAll('.v-tab').find((tab) => tab.text().includes('Blocked addresses'))
        expect(blockedTab).toBeDefined()
        await blockedTab!.trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Unblock')
        })

        const unblockButton = wrapper.findAll('button').find((button) => button.text() === 'Unblock')
        expect(unblockButton).toBeDefined()
        await unblockButton!.trigger('click')

        await vi.waitFor(() => {
            expect(unblock).toHaveBeenCalledWith({ path: { emailBlockId: 5 } })
        })
    })
})
