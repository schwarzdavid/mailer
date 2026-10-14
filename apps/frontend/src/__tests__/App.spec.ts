import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import App from '../App.vue'
import { mountView } from './support.ts'
import { useNotificationHost, useNotify } from '@/composables/useNotify.ts'

vi.stubGlobal('visualViewport', null)

async function mountApp(routes: RouteRecordRaw[], path = '/') {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push(path)
    await router.isReady()

    const wrapper = mountView(App, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
}

describe('App', () => {
    it('renders the active route inside the Vuetify application shell', async () => {
        const HomeView = defineComponent({
            render: () => h('main', { class: 'home-view' }, 'Home'),
        })

        const wrapper = await mountApp([{ path: '/', component: HomeView }])

        expect(wrapper.find('.v-application').exists()).toBe(true)
        expect(wrapper.find('.home-view').text()).toBe('Home')
    })

    it('hosts the global notifications', async () => {
        const HomeView = defineComponent({ render: () => h('main', 'Home') })
        await mountApp([{ path: '/', component: HomeView }])

        useNotify().success('Project saved')

        await vi.waitFor(() => expect(document.body.textContent).toContain('Project saved'))
        useNotificationHost().dismiss()
    })
})
