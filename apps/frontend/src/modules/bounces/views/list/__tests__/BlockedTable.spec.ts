import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type EmailBlockDto } from 'api'
import BlockedTable from '../partials/BlockedTable.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const blocked: EmailBlockDto[] = [
    {
        emailBlockId: 5,
        emailAddress: 'missing@example.org',
        blockCount: 2,
        blockedUntil: new Date('2026-08-13T10:00:00.000Z'),
    },
    {
        emailBlockId: 6,
        emailAddress: 'gone@example.org',
        blockCount: 7,
        blockedUntil: null,
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('BlockedTable', () => {
    it('shows skeletons while loading', () => {
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockReturnValue(new Promise<EmailBlockDto[]>(() => {}))
        const wrapper = mountView(BlockedTable)

        expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
    })

    it('shows the empty hint when nothing is blocked', async () => {
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue([])
        const wrapper = mountView(BlockedTable)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('No addresses are currently blocked.')
        })
    })

    it('lists blocked addresses with expiry and count', async () => {
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const wrapper = mountView(BlockedTable)

        await vi.waitFor(() => {
            expect(wrapper.findAll('tbody tr')).toHaveLength(2)
        })
        const [first, second] = wrapper.findAll('tbody tr').map((row) => row.findAll('td').map((cell) => cell.text()))
        expect(first!.slice(0, 3)).toEqual([
            'missing@example.org',
            new Date('2026-08-13T10:00:00.000Z').toLocaleString(),
            '2',
        ])
        expect(second!.slice(0, 3)).toEqual(['gone@example.org', '', '7'])
    })

    it('unblocks the address of the clicked row', async () => {
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const unblockSpy = vi.spyOn(BounceApi, 'unblock').mockResolvedValue({ ...blocked[1]!, blockedUntil: null })
        const wrapper = mountView(BlockedTable)
        await vi.waitFor(() => {
            expect(wrapper.findAll('tbody tr')).toHaveLength(2)
        })

        await wrapper.findAll('tbody tr')[1]!.get('button').trigger('click')

        await vi.waitFor(() => {
            expect(unblockSpy).toHaveBeenCalledWith({ path: { emailBlockId: 6 } })
        })
    })

    it('shows the api error when unblocking fails', async () => {
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        vi.spyOn(BounceApi, 'unblock').mockRejectedValue({ message: 'Block not found' })
        const wrapper = mountView(BlockedTable)
        await vi.waitFor(() => {
            expect(wrapper.findAll('tbody tr')).toHaveLength(2)
        })

        await wrapper.findAll('tbody tr')[1]!.get('button').trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Block not found')
        })
    })

    it('falls back to a generic message when unblocking fails without one', async () => {
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        vi.spyOn(BounceApi, 'unblock').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(BlockedTable)
        await vi.waitFor(() => {
            expect(wrapper.findAll('tbody tr')).toHaveLength(2)
        })

        await wrapper.findAll('tbody tr')[0]!.get('button').trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The address could not be unblocked')
        })
    })
})
