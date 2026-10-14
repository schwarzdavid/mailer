import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { SettingsApi, SetupApi, type AuthenticationDto, type SendingDomainDto } from 'api'
import OnboardingAccountStep from '../partials/OnboardingAccountStep.vue'
import OnboardingDomainStep from '../partials/OnboardingDomainStep.vue'
import OnboardingRecordsStep from '../partials/OnboardingRecordsStep.vue'
import { mountView } from '@/__tests__/support.ts'
import { JWT_KEY } from '@/constants/jwtKey.ts'

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
        role: { type: 'super_admin', roleId: 1, name: 'Super Admin' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
}

const sendingDomain: SendingDomainDto = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    lastCheckedAt: null,
    records: [
        {
            use: 'spf',
            type: 'txt',
            host: 'mail.sending-domain.org',
            value: 'v=spf1 ip4:203.0.113.10 -all',
            current: null,
            status: 'invalid',
        },
    ],
}

afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem(JWT_KEY)
})

describe('OnboardingAccountStep', () => {
    it('registers the administrator, stores the token and completes the step', async () => {
        const registerSpy = vi.spyOn(SetupApi, 'registerUser').mockResolvedValue(authentication)
        const wrapper = mountView(OnboardingAccountStep)

        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[type="email"]').setValue('ada@example.com')
        await wrapper.get('input[type="password"]').setValue('correct-horse')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.emitted('completed')).toHaveLength(1)
        })
        expect(registerSpy).toHaveBeenCalledWith({
            body: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', password: 'correct-horse' },
        })
        expect(localStorage.getItem(JWT_KEY)).toContain('jwt-token')
    })

    it('blocks short passwords and invalid emails', async () => {
        const registerSpy = vi.spyOn(SetupApi, 'registerUser')
        const wrapper = mountView(OnboardingAccountStep)

        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[type="email"]').setValue('ada@')
        await wrapper.get('input[type="password"]').setValue('short')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error input[type="email"]').exists()).toBe(true)
            expect(wrapper.find('.v-input--error input[type="password"]').exists()).toBe(true)
        })
        expect(registerSpy).not.toHaveBeenCalled()
        expect(wrapper.emitted('completed')).toBeUndefined()
    })

    it('requires all fields', async () => {
        const registerSpy = vi.spyOn(SetupApi, 'registerUser')
        const wrapper = mountView(OnboardingAccountStep)

        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.findAll('.v-input--error')).toHaveLength(4)
        })
        expect(registerSpy).not.toHaveBeenCalled()
    })

    it.each([
        ['empty', ''],
        ['blank', '   '],
    ])('rejects %s first and last names', async (_, name) => {
        const registerSpy = vi.spyOn(SetupApi, 'registerUser')
        const wrapper = mountView(OnboardingAccountStep)

        await wrapper.get('input[name="firstName"]').setValue(name)
        await wrapper.get('input[name="lastName"]').setValue(name)
        await wrapper.get('input[type="email"]').setValue('ada@example.com')
        await wrapper.get('input[type="password"]').setValue('correct-horse')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error input[name="firstName"]').exists()).toBe(true)
            expect(wrapper.find('.v-input--error input[name="lastName"]').exists()).toBe(true)
        })
        expect(registerSpy).not.toHaveBeenCalled()
        expect(wrapper.emitted('completed')).toBeUndefined()
    })

    it('shows the API error and stays on the step when the registration fails', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockRejectedValue({ message: 'Setup already completed', statusCode: 409 })
        const wrapper = mountView(OnboardingAccountStep)

        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[type="email"]').setValue('ada@example.com')
        await wrapper.get('input[type="password"]').setValue('correct-horse')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Setup already completed')
        })
        expect(wrapper.emitted('completed')).toBeUndefined()
        expect(localStorage.getItem(JWT_KEY)).toBeNull()
    })

    it('falls back to a generic error when the registration fails without a message', async () => {
        vi.spyOn(SetupApi, 'registerUser').mockRejectedValue(null)
        const wrapper = mountView(OnboardingAccountStep)

        await wrapper.get('input[name="firstName"]').setValue('Ada')
        await wrapper.get('input[name="lastName"]').setValue('Lovelace')
        await wrapper.get('input[type="email"]').setValue('ada@example.com')
        await wrapper.get('input[type="password"]').setValue('correct-horse')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The account could not be created')
        })
        expect(wrapper.emitted('completed')).toBeUndefined()
    })
})

describe('OnboardingDomainStep', () => {
    it('configures the sending domain and completes the step', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue(sendingDomain)
        const wrapper = mountView(OnboardingDomainStep)

        expect(wrapper.text()).toContain('Configure the domain this server sends mail from.')
        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.emitted('completed')).toHaveLength(1)
        })
        expect(configureSpy).toHaveBeenCalledWith({
            body: { fqdn: 'mail.sending-domain.org', serverIpv4: '203.0.113.10', serverIpv6: undefined },
        })
    })

    it('does not complete with an invalid domain', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain')
        const wrapper = mountView(OnboardingDomainStep)

        await wrapper.get('input[name="fqdn"]').setValue('not a domain')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error input[name="fqdn"]').exists()).toBe(true)
        })
        expect(configureSpy).not.toHaveBeenCalled()
        expect(wrapper.emitted('completed')).toBeUndefined()
    })
})

describe('OnboardingRecordsStep', () => {
    it('lists the DNS records of the configured sending domain', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain })
        const wrapper = mountView(OnboardingRecordsStep)

        await vi.waitFor(() => {
            expect(wrapper.findAll('input').map((input) => input.element.value)).toContain(
                'v=spf1 ip4:203.0.113.10 -all',
            )
        })
    })

    it('can be finished while no sending domain is known yet', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountView(OnboardingRecordsStep)
        await flushPromises()

        const finish = wrapper.findAll('button').find((button) => button.text() === 'Finish')
        await finish!.trigger('click')

        expect(wrapper.emitted('completed')).toHaveLength(1)
        expect(wrapper.find('input').exists()).toBe(false)
    })
})
