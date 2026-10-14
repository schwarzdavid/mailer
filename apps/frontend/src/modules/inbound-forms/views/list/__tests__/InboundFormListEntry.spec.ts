import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { InboundFormDto } from 'api'
import InboundFormListEntry from '../partials/InboundFormListEntry.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const form: InboundFormDto = {
    inboundFormId: 7,
    projectId: 5,
    domainId: null,
    name: 'Contact',
    slug: 'contact-us',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

function createTestRouter() {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: defineComponent({ render: () => null }) },
            {
                path: '/forms/:inboundFormId',
                name: RouteNames.INBOUND_FORM_DETAILS,
                component: defineComponent({ render: () => null }),
            },
        ],
    })
}

describe('InboundFormListEntry', () => {
    it('shows name, slug and active state and links to the form details', () => {
        const wrapper = mountView(InboundFormListEntry, {
            props: { form },
            global: { plugins: [createTestRouter()] },
        })

        expect(wrapper.text()).toContain('Contact')
        expect(wrapper.text()).toContain('contact-us')
        expect(wrapper.text()).toContain('Active')
        expect(wrapper.get('a').attributes('href')).toBe('/forms/7')
    })

    it('marks inactive forms', () => {
        const wrapper = mountView(InboundFormListEntry, {
            props: { form: { ...form, isActive: false } },
            global: { plugins: [createTestRouter()] },
        })

        expect(wrapper.text()).toContain('Inactive')
    })
})
