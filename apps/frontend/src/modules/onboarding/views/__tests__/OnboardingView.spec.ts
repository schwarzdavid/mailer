import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import { defineComponent, h } from 'vue'
import { VApp } from 'vuetify/components'
import { SettingsApi, SetupApi, type AuthenticationDto } from 'api'
import OnboardingView from '../OnboardingView.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'
import { JWT_KEY } from '@/constants/jwtKey.ts'

const OnboardingHost = defineComponent({
    setup: () => () => h(VApp, () => h(OnboardingView)),
})

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const authentication: AuthenticationDto = {
    token: 'jwt-token',
    user: {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
}

async function fillAccountStep(wrapper: ReturnType<typeof mountView>) {
    await wrapper.get('input[name="firstName"]').setValue('Ada')
    await wrapper.get('input[name="lastName"]').setValue('Lovelace')
    await wrapper.get('input[type="email"]').setValue('ada@example.com')
    await wrapper.get('input[type="password"]').setValue('correct-horse-battery-staple')
    await wrapper.get('form').trigger('submit')
}

function domainForm(wrapper: ReturnType<typeof mountView>) {
    return wrapper.findAll('form').find((form) => form.find('input[name="fqdn"]').exists())
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    localStorage.removeItem(JWT_KEY)
})

describe('OnboardingView', () => {
    it('starts on the account step', () => {
        const wrapper = mountView(OnboardingHost)

        expect(wrapper.text()).toContain('Create your account')
        expect(wrapper.find('input[name="firstName"]').exists()).toBe(true)
    })

    it('advances to the domain step after a successful registration', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountView(OnboardingHost)

        await fillAccountStep(wrapper)

        await vi.waitFor(() => {
            expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true)
        })
    })

    it('advances to the DNS records step after the domain is saved, then routes to the dashboard', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue({
            fqdn: 'mail.sending-domain.org',
            serverIpv4: '203.0.113.10',
            serverIpv6: null,
            lastCheckedAt: null,
            records: [],
        })
        const wrapper = mountView(OnboardingHost)

        await fillAccountStep(wrapper)
        await vi.waitFor(() => {
            expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true)
        })

        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await domainForm(wrapper)!.trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Publish these DNS records')
        })

        const finishButton = () => wrapper.findAll('button').find((button) => button.text().includes('Finish'))

        await vi.waitFor(() => {
            expect(finishButton()).toBeTruthy()
        })

        await finishButton()!.trigger('click')

        expect(push).toHaveBeenCalledWith({ name: RouteNames.DASHBOARD })
    })
})
