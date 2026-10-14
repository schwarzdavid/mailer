import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type BounceDto } from 'api'
import BounceTable from '../partials/BounceTable.vue'
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

afterEach(() => {
    vi.restoreAllMocks()
})

describe('BounceTable', () => {
    it('shows skeletons while loading', () => {
        vi.spyOn(BounceApi, 'getBounces').mockReturnValue(new Promise<BounceDto[]>(() => {}))
        const wrapper = mountView(BounceTable)

        expect(wrapper.find('.v-skeleton-loader').exists()).toBe(true)
        expect(wrapper.find('table').exists()).toBe(false)
    })

    it('shows the empty hint when nothing bounced', async () => {
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue([])
        const wrapper = mountView(BounceTable)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('No bounces recorded yet.')
        })
    })

    it('renders one row per bounce with every column', async () => {
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(bounces)
        const wrapper = mountView(BounceTable)

        await vi.waitFor(() => {
            expect(wrapper.findAll('tbody tr')).toHaveLength(2)
        })
        const cells = wrapper
            .findAll('tbody tr')[0]!
            .findAll('td')
            .map((cell) => cell.text())
        expect(cells).toEqual([
            'missing@example.org',
            'Permanent',
            '5.1.1',
            'User unknown',
            new Date('2026-07-13T10:00:00.000Z').toLocaleString(),
        ])
    })

    it('colours permanent bounces as errors and transient ones as warnings', async () => {
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(bounces)
        const wrapper = mountView(BounceTable)

        await vi.waitFor(() => {
            expect(wrapper.findAll('.v-chip')).toHaveLength(2)
        })
        const chips = wrapper.findAll('.v-chip')
        expect(chips[0]!.classes()).toContain('text-error')
        expect(chips[1]!.classes()).toContain('text-warning')
    })
})
