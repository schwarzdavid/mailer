import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, InboundFormApi, type InboundFormDto } from 'api'
import type { Router } from 'vue-router'
import InboundFormListView from '../InboundFormListView.vue'
import { mountView } from '@/__tests__/support.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

const forms: InboundFormDto[] = [
    {
        inboundFormId: 1,
        domainId: 3,
        name: 'Contact',
        slug: 'contact',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
        inboundFormId: 2,
        domainId: null,
        name: 'Feedback',
        slug: 'feedback',
        isActive: false,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

describe('InboundFormListView', () => {
    it('renders one entry per form with name and slug', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue(forms)
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([])
        const wrapper = mountView(InboundFormListView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Contact')
        })
        expect(wrapper.text()).toContain('contact')
        expect(wrapper.text()).toContain('Feedback')
        expect(wrapper.get('h1').text()).toBe('Inbound Forms')
    })
})
