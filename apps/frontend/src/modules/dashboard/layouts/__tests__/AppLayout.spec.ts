import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { VApp } from 'vuetify/components'
import { AuthApi, SettingsApi, type SettingsDto, type UserDto } from 'api'
import AppLayout from '../AppLayout.vue'
import { mountView } from '@/__tests__/support.ts'
import { dnsRecord } from '@/__tests__/fixtures.ts'
import { RouteNames } from '@/router/RouteNames.ts'

vi.stubGlobal('visualViewport', null)

const AppLayoutHost = defineComponent({
    setup: () => () => h(VApp, () => h(AppLayout)),
})

const Page = defineComponent({ render: () => h('p', { class: 'page' }, 'Page content') })

const user: UserDto = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: { roleId: 1, type: 'super_admin', name: 'Super Admin' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const healthy: SettingsDto = {
    sendingDomain: {
        fqdn: 'mail.sending-domain.org',
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        lastCheckedAt: null,
        records: [dnsRecord({ use: 'a', type: 'a' }), dnsRecord({ use: 'mx', type: 'mx' })],
    },
}

async function layoutRouter(path: string): Promise<Router> {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: RouteNames.DASHBOARD, component: Page, meta: { section: 'dashboard' } },
            { path: '/projects', name: RouteNames.PROJECT_LIST, component: Page, meta: { section: 'projects' } },
            {
                path: '/forms/:id',
                name: RouteNames.INBOUND_FORM_DETAILS,
                component: Page,
                meta: { section: 'projects' },
            },
            {
                path: '/domains',
                name: RouteNames.DOMAIN_LIST,
                component: Page,
                meta: { section: 'domains', ability: { action: 'read', subject: 'Domain' } },
            },
            { path: '/bounces', name: RouteNames.BOUNCE_LIST, component: Page },
            { path: '/users', name: RouteNames.USER_LIST, component: Page },
            { path: '/roles', name: RouteNames.ROLE_LIST, component: Page },
            { path: '/settings', name: RouteNames.SETTINGS, component: Page },
        ],
    })
    await router.push(path)
    return router
}

async function mountLayout(path: string, rules?: Parameters<typeof mountView>[2]) {
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(user)
    const router = await layoutRouter(path)
    return mountView(AppLayoutHost, { global: { plugins: [router] } }, rules)
}

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('AppLayout', () => {
    it('renders the page inside the shell', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(healthy)
        const wrapper = await mountLayout('/')

        await vi.waitFor(() => expect(wrapper.find('.page').exists()).toBe(true))
        expect(wrapper.text()).toContain('Mail Admin')
    })

    it('highlights the section of a nested page', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(healthy)
        const wrapper = await mountLayout('/forms/9')

        await vi.waitFor(() => expect(wrapper.find('[aria-current="page"]').exists()).toBe(true))
        expect(wrapper.get('[aria-current="page"]').text()).toBe('Projects')
    })

    it('shows every item for manage-all abilities', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(healthy)
        const wrapper = await mountLayout('/')

        await vi.waitFor(() => expect(wrapper.text()).toContain('Users'))
        for (const label of ['Dashboard', 'Projects', 'Domains', 'Bounces', 'Administration', 'Roles', 'Settings']) {
            expect(wrapper.text()).toContain(label)
        }
    })

    it('leaves out items the user may not open', async () => {
        const wrapper = await mountLayout('/', [{ action: 'read', subject: 'Project' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Projects'))
        for (const label of ['Domains', 'Bounces', 'Users', 'Roles', 'Settings', 'Administration']) {
            expect(wrapper.text()).not.toContain(label)
        }
    })

    it('flags invalid sending-domain records on the Settings item', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({
            sendingDomain: { ...healthy.sendingDomain!, records: [dnsRecord({ status: 'invalid' })] },
        })
        const wrapper = await mountLayout('/')

        await vi.waitFor(() => expect(wrapper.text()).toContain('1 sending-domain record needs attention'))
        expect(wrapper.find('.status-dot--warning').exists()).toBe(true)
    })

    it('flags a missing sending domain', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = await mountLayout('/')

        await vi.waitFor(() => expect(wrapper.text()).toContain("The sending domain isn't configured yet"))
    })

    it('stays quiet while every record is valid', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(healthy)
        const wrapper = await mountLayout('/')

        await vi.waitFor(() => expect(wrapper.text()).toContain('Settings'))
        expect(wrapper.find('.status-dot--warning').exists()).toBe(false)
    })

    it('shows the no-access state instead of a page the user may not open', async () => {
        const wrapper = await mountLayout('/domains', [{ action: 'read', subject: 'Project' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain("You don't have access to this page"))
        expect(wrapper.text()).toContain('View domains')
        expect(wrapper.find('.page').exists()).toBe(false)
    })
})
