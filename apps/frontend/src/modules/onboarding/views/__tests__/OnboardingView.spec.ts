import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import { SettingsApi, SetupApi, AuthApi, type AuthenticationDto, type SendingDomainDto } from 'api'
import OnboardingView from '../OnboardingView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { dnsRecord } from '@/__tests__/fixtures.ts'
import { RouteNames } from '@/router/RouteNames.ts'
import { JWT_KEY } from '@/constants/jwtKey.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const authentication: AuthenticationDto = {
    token: 'jwt-token',
    user: {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        role: { type: 'super_admin', roleId: 1, name: 'Super Admin' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
}

const setupToken = 'token-from-the-log-0123456789abcd'

const sendingDomain: SendingDomainDto = {
    fqdn: 'mail.acme-mailer.com',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    lastCheckedAt: null,
    records: [dnsRecord({ use: 'a', type: 'a' }), dnsRecord({ use: 'dkim', status: 'invalid' })],
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    localStorage.removeItem(JWT_KEY)
    document.body.innerHTML = ''
})

describe('OnboardingView', () => {
    it('starts with the admin account on a fresh installation', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'account' })
        const wrapper = mountInApp(OnboardingView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Create the admin account'))
        expect(wrapper.get('h1').text()).toBe('Welcome to Mail Admin')
        expect(wrapper.text()).not.toContain('Log out')
    })

    it('creates the account and moves on to the DNS records', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'account' })
        const register = vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(authentication.user)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain })
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(wrapper.find('input[name="firstName"]').exists()).toBe(true))

        await wrapper.get('input[name="setupToken"]').setValue(setupToken)
        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[name="email"]').setValue('ada@example.com')
        await wrapper.get('input[name="password"]').setValue('correct-horse-battery-staple')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toBe('Publish the DNS records'))
        await vi.waitFor(() => expect(wrapper.text()).toContain('1 of 2 records are valid.'))
        expect(wrapper.find('input[name="serverIpv4"]').exists()).toBe(false)
        expect(register).toHaveBeenCalled()
        await vi.waitFor(() => expect(localStorage.getItem(JWT_KEY)).toBe('jwt-token'))
        expect(wrapper.text()).toContain('Signed in as Ada Lovelace')
    })

    it('sends the setup token with the account', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'account' })
        const register = vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(wrapper.find('input[name="setupToken"]').exists()).toBe(true))

        await wrapper.get('input[name="setupToken"]').setValue(setupToken)
        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[name="email"]').setValue('ada@example.com')
        await wrapper.get('input[name="password"]').setValue('correct-horse-battery-staple')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(register).toHaveBeenCalledWith({ body: expect.objectContaining({ setupToken }) }))
    })

    it('requires the setup token', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'account' })
        const register = vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(wrapper.find('input[name="setupToken"]').exists()).toBe(true))

        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[name="email"]').setValue('ada@example.com')
        await wrapper.get('input[name="password"]').setValue('correct-horse-battery-staple')
        await wrapper.get('form').trigger('submit')

        const field = wrapper.get('input[name="setupToken"]').element.closest('.v-input')!
        await vi.waitFor(() => expect(field.classList).toContain('v-input--error'))
        expect(field.querySelector('.v-messages__message')?.textContent).not.toContain('docker compose')
        expect(register).not.toHaveBeenCalled()
    })

    it('tells the admin where to find the setup token', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'account' })
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(wrapper.find('input[name="setupToken"]').exists()).toBe(true))

        expect(wrapper.text()).toContain('Setup token')
        expect(wrapper.text()).toContain('docker compose logs backend | grep "Setup token"')
    })

    it('shows a failed registration inside the card', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'account' })
        vi.spyOn(SetupApi, 'registerUser').mockRejectedValue({ message: 'Setup already completed' })
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(wrapper.find('input[name="firstName"]').exists()).toBe(true))

        await wrapper.get('input[name="setupToken"]').setValue(setupToken)
        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[name="email"]').setValue('ada@example.com')
        await wrapper.get('input[name="password"]').setValue('correct-horse-battery-staple')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(wrapper.text()).toContain('Setup already completed'))
    })

    it('shows two setup steps without a way back from the records', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'records' })
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(authentication.user)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain })
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('Finish setup'))

        const stepper = wrapper.get('.setup-stepper').text()
        expect(stepper).toContain('Admin account')
        expect(stepper).toContain('DNS records')
        expect(stepper).not.toContain('Sending domain')
        expect(findButton(wrapper, 'Back')).toBeUndefined()
        expect(wrapper.find('input').exists()).toBe(false)
    })

    it('finishes setup with open records and opens the dashboard', async () => {
        push.mockResolvedValue(undefined)
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'records' })
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(authentication.user)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain })
        const finish = vi.spyOn(SetupApi, 'finishSetup').mockResolvedValue({ needsSetup: false, step: 'finished' })
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(findButton(wrapper, 'Finish setup')).toBeDefined())

        await findButton(wrapper, 'Finish setup')!.trigger('click')

        await vi.waitFor(() => expect(push).toHaveBeenCalledWith({ name: RouteNames.DASHBOARD }))
        expect(finish).toHaveBeenCalled()
    })
})
