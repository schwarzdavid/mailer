import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import {
    SettingsApi,
    SetupApi,
    AuthApi,
    type AuthenticationDto,
    type SendingDomainDto,
    type SendingDomainProposalDto,
} from 'api'
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

const proposal: SendingDomainProposalDto = {
    fqdn: 'mail.acme-mailer.com',
    serverIpv4: '198.51.100.7',
    serverIpv6: null,
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

    it('creates the account and moves on to the sending domain', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'account' })
        const register = vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(authentication.user)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        vi.spyOn(SettingsApi, 'getSendingDomainProposal').mockResolvedValue(proposal)
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(wrapper.find('input[name="firstName"]').exists()).toBe(true))

        await wrapper.get('input[name="setupToken"]').setValue(setupToken)
        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[name="email"]').setValue('ada@example.com')
        await wrapper.get('input[name="password"]').setValue('correct-horse-battery-staple')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(wrapper.find('input[name="serverIpv4"]').exists()).toBe(true))
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

    it('prefills the addresses from DNS and lets the admin override them', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'sendingDomain' })
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(authentication.user)
        const getSettings = vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        vi.spyOn(SettingsApi, 'getSendingDomainProposal').mockResolvedValue(proposal)
        const configure = vi.spyOn(SettingsApi, 'configureSendingDomain').mockImplementation(() => {
            getSettings.mockResolvedValue({ sendingDomain })
            return Promise.resolve(sendingDomain)
        })
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() =>
            expect((wrapper.get('input[name="serverIpv4"]').element as HTMLInputElement).value).toBe('198.51.100.7'),
        )
        expect(wrapper.text()).toContain('mail.acme-mailer.com')

        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toBe('Publish the DNS records'))
        expect(configure).toHaveBeenCalledWith({ body: { serverIpv4: '203.0.113.10', serverIpv6: undefined } })
        await vi.waitFor(() => expect(wrapper.text()).toContain('1 of 2 records are valid.'))
    })

    it('leaves the addresses empty when the host name has no address records', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'sendingDomain' })
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(authentication.user)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        vi.spyOn(SettingsApi, 'getSendingDomainProposal').mockResolvedValue({
            ...proposal,
            serverIpv4: null,
            serverIpv6: null,
        })
        const wrapper = mountInApp(OnboardingView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('mail.acme-mailer.com'))
        expect((wrapper.get('input[name="serverIpv4"]').element as HTMLInputElement).value).toBe('')
        expect((wrapper.get('input[name="serverIpv6"]').element as HTMLInputElement).value).toBe('')
    })

    it('lets the admin go back to correct the server addresses', async () => {
        vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true, step: 'records' })
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(authentication.user)
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain })
        const wrapper = mountInApp(OnboardingView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('Finish setup'))

        await findButton(wrapper, 'Sending domain')!.trigger('click')

        await vi.waitFor(() =>
            expect((wrapper.get('input[name="serverIpv4"]').element as HTMLInputElement).value).toBe('203.0.113.10'),
        )
        expect(wrapper.text()).toContain('mail.acme-mailer.com')
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
