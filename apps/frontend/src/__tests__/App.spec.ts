import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import App from '../App.vue'
import { mountView } from './support.ts'

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

    it('shows a loading indicator while the default view resolves no component', async () => {
        // A route that only fills a named view leaves the default `<RouterView>`
        // in App.vue without a component, exercising its loading fallback.
        const HelperView = defineComponent({ render: () => h('div', { class: 'helper-view' }) })

        const wrapper = await mountApp([{ path: '/', components: { helper: HelperView } }])

        expect(wrapper.find('.v-progress-circular').exists()).toBe(true)
        expect(wrapper.find('.helper-view').exists()).toBe(false)
    })
})
