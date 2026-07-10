import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, InboundFormApi, type InboundFormDetailDto } from 'api'
import type { Router } from 'vue-router'
import InboundFormDetailView from '../InboundFormDetailView.vue'
import { mountView } from '@/__tests__/support.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params: { inboundFormId: '1' } }),
        useRouter: () => ({ push }),
    }
})

const detail: InboundFormDetailDto = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [
        {
            inboundFormFieldId: 21,
            key: 'email',
            label: 'Email',
            type: 'email',
            defaultValue: null,
            validation: { required: true },
        },
    ],
    security: [
        {
            inboundFormSecurityId: 11,
            type: 'honeypot',
            location: 'body',
            key: 'website',
            config: null,
        },
    ],
    receivers: [
        {
            inboundFormReceiverId: 31,
            emailFrom: 'noreply@mail.example.com',
            emailReceiver: 'owner@business.com',
            emailReplyTo: '{{email}}',
            isActive: true,
            draftVersion: null,
            publishedVersion: 2,
        },
    ],
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

describe('InboundFormDetailView', () => {
    it('renders all four setup cards from the loaded form', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([])
        const wrapper = mountView(InboundFormDetailView)

        await vi.waitFor(() => {
            expect(wrapper.get('h1').text()).toBe('Contact')
        })
        expect(wrapper.text()).toContain('General')
        expect(wrapper.html()).toContain('/api/public/form/contact')
        expect(wrapper.text()).toContain('email')
        expect(wrapper.text()).toContain('Honeypot')
        expect(wrapper.text()).toContain('owner@business.com')
        expect(wrapper.text()).toContain('Published v2')
    })
})
