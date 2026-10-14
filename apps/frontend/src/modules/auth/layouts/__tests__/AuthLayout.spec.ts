import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { VApp } from 'vuetify/components'
import AuthLayout from '../AuthLayout.vue'
import { mountView } from '@/__tests__/support.ts'

const ChildView = defineComponent({ render: () => h('p', { class: 'child-view' }, 'Child content') })

const AuthLayoutHost = defineComponent({
    setup: () => () => h(VApp, () => h(AuthLayout)),
})

describe('AuthLayout', () => {
    it('renders the active child route below the logo with the copyright footer', async () => {
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/login', component: AuthLayout, children: [{ path: '', component: ChildView }] }],
        })
        await router.push('/login')
        const wrapper = mountView(AuthLayoutHost, { global: { plugins: [router] } })

        expect(wrapper.find('.auth-layout__column .child-view').text()).toBe('Child content')
        expect(wrapper.text()).toContain('Mail Admin')
        expect(wrapper.get('footer').text()).toContain('David Schwarz IT Services GmbH')
    })
})
