import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent, h } from 'vue'
import { VApp } from 'vuetify/components'
import { SettingsApi, type SettingsDto } from 'api'
import AppLayout from '../AppLayout.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const AppLayoutHost = defineComponent({
    setup: () => () => h(VApp, () => h(AppLayout)),
})

function createTestRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: Object.values(RouteNames).map((name, index) => ({
            path: index === 0 ? '/' : `/${index}`,
            name,
            component: { template: '<div />' },
        })),
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
    describe('sending domain health indicator', () => {
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

    describe('navigation tab visibility', () => {
        it('shows every tab for manage-all abilities', async () => {
            vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
            const wrapper = mountView(AppLayoutHost, { global: { plugins: [createTestRouter()] } })

            await vi.waitFor(() => expect(wrapper.text()).toContain('Users'))
            expect(wrapper.text()).toContain('Domains')
            expect(wrapper.text()).toContain('Bounces')
            expect(wrapper.text()).toContain('Settings')
        })

        it('hides gated tabs without the read permissions', async () => {
            const wrapper = mountView(AppLayoutHost, { global: { plugins: [createTestRouter()] } }, [])

            await vi.waitFor(() => expect(wrapper.text()).toContain('Projects'))
            expect(wrapper.text()).not.toContain('Domains')
            expect(wrapper.text()).not.toContain('Bounces')
            expect(wrapper.text()).not.toContain('Users')
            expect(wrapper.text()).not.toContain('Settings')
        })
    })
})
