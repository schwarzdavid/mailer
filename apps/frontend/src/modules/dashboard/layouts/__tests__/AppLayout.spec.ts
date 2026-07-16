import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent, h } from 'vue'
import { VApp } from 'vuetify/components'
import { SettingsApi, type SettingsDto } from 'api'
import AppLayout from '../AppLayout.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const EmptyView = defineComponent({ render: () => h('div') })

const AppLayoutHost = defineComponent({
    setup: () => () => h(VApp, () => h(AppLayout)),
})

function createTestRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: RouteNames.DASHBOARD, component: EmptyView },
            { path: '/domains', name: RouteNames.DOMAIN_LIST, component: EmptyView },
            { path: '/forms', name: RouteNames.INBOUND_FORM_LIST, component: EmptyView },
            { path: '/bounces', name: RouteNames.BOUNCE_LIST, component: EmptyView },
            { path: '/settings', name: RouteNames.SETTINGS, component: EmptyView },
            { path: '/login', name: RouteNames.LOGIN, component: EmptyView },
        ],
    })
}

const healthy: SettingsDto = {
    sendingDomain: {
        fqdn: 'mail.sending-domain.org',
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        lastCheckedAt: null,
        records: [
            {
                host: 'mail.sending-domain.org',
                type: 'a',
                use: 'a',
                value: '203.0.113.10',
                current: '203.0.113.10',
                status: 'valid',
            },
        ],
    },
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('AppLayout', () => {
    it('shows a warning icon while no sending domain is configured', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountView(AppLayoutHost, { global: { plugins: [createTestRouter()] } })

        await vi.waitFor(() => {
            expect(wrapper.find('.mdi-alert-circle').exists()).toBe(true)
        })
        expect(wrapper.find('.mdi-check-circle').exists()).toBe(false)
    })

    it('shows a healthy icon when every record is valid', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(healthy)
        const wrapper = mountView(AppLayoutHost, { global: { plugins: [createTestRouter()] } })

        await vi.waitFor(() => {
            expect(wrapper.find('.mdi-check-circle').exists()).toBe(true)
        })
        expect(wrapper.find('.mdi-alert-circle').exists()).toBe(false)
    })

    it('shows a warning icon when a record is invalid', async () => {
        const ill: SettingsDto = {
            sendingDomain: {
                ...healthy.sendingDomain!,
                records: [{ ...healthy.sendingDomain!.records[0]!, status: 'invalid' }],
            },
        }
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(ill)
        const wrapper = mountView(AppLayoutHost, { global: { plugins: [createTestRouter()] } })

        await vi.waitFor(() => {
            expect(wrapper.find('.mdi-alert-circle').exists()).toBe(true)
        })
    })
})
