import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type SendingDomainDto } from 'api'
import SendingDomainForm from '../SendingDomainForm.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const sendingDomain: SendingDomainDto = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    lastCheckedAt: null,
    records: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('SendingDomainForm', () => {
    it('renders fields for domain and server addresses', () => {
        const wrapper = mountView(SendingDomainForm)

        expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true)
        expect(wrapper.find('input[name="serverIpv4"]').exists()).toBe(true)
        expect(wrapper.find('input[name="serverIpv6"]').exists()).toBe(true)
    })

    it('prefills from an existing configuration', () => {
        const wrapper = mountView(SendingDomainForm, { props: { sendingDomain } })

        expect((wrapper.get('input[name="fqdn"]').element as HTMLInputElement).value).toBe('mail.sending-domain.org')
        expect((wrapper.get('input[name="serverIpv4"]').element as HTMLInputElement).value).toBe('203.0.113.10')
    })

    it('does not submit an invalid ipv4 address', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain')
        const wrapper = mountView(SendingDomainForm)

        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('not-an-ip')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error').exists()).toBe(true)
        })
        expect(configureSpy).not.toHaveBeenCalled()
    })

    it('does not submit an empty form', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain')
        const wrapper = mountView(SendingDomainForm)

        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.findAll('.v-input--error')).toHaveLength(2)
        })
        expect(configureSpy).not.toHaveBeenCalled()
    })

    it('explains an invalid domain name', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain')
        const wrapper = mountView(SendingDomainForm)

        await wrapper.get('input[name="fqdn"]').setValue('mailserver.invalidtld')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Invalid domain name')
        })
        expect(configureSpy).not.toHaveBeenCalled()
    })

    it('does not submit an invalid ipv6 address', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain')
        const wrapper = mountView(SendingDomainForm)

        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('input[name="serverIpv6"]').setValue('2001:db8::zz')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('input[name="serverIpv6"]').element.closest('.v-input--error')).not.toBeNull()
        })
        expect(configureSpy).not.toHaveBeenCalled()
    })

    it('submits an ipv6 address when given', async () => {
        const configureSpy = vi
            .spyOn(SettingsApi, 'configureSendingDomain')
            .mockResolvedValue({ ...sendingDomain, serverIpv6: '2001:db8::1' })
        const wrapper = mountView(SendingDomainForm)

        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('input[name="serverIpv6"]').setValue('2001:db8::1')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(configureSpy).toHaveBeenCalledWith({
                body: { fqdn: 'mail.sending-domain.org', serverIpv4: '203.0.113.10', serverIpv6: '2001:db8::1' },
            })
        })
    })

    it('resubmits a prefilled configuration unchanged', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue(sendingDomain)
        const wrapper = mountView(SendingDomainForm, { props: { sendingDomain } })

        expect((wrapper.get('input[name="serverIpv6"]').element as HTMLInputElement).value).toBe('')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.emitted('saved')).toEqual([[sendingDomain]])
        })
        expect(configureSpy).toHaveBeenCalledWith({
            body: { fqdn: 'mail.sending-domain.org', serverIpv4: '203.0.113.10', serverIpv6: undefined },
        })
    })

    it('submits the configuration and emits saved', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue(sendingDomain)
        const wrapper = mountView(SendingDomainForm)

        await wrapper.get('input[name="fqdn"]').setValue('mail.sending-domain.org')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.emitted('saved')).toBeTruthy()
        })
        expect(configureSpy).toHaveBeenCalledWith({
            body: { fqdn: 'mail.sending-domain.org', serverIpv4: '203.0.113.10', serverIpv6: undefined },
        })
    })

    it('shows the API error and does not emit saved when saving fails', async () => {
        vi.spyOn(SettingsApi, 'configureSendingDomain').mockRejectedValue({
            message: 'DNS lookup failed',
            statusCode: 502,
        })
        const wrapper = mountView(SendingDomainForm, { props: { sendingDomain } })

        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('DNS lookup failed')
        })
        expect(wrapper.emitted('saved')).toBeUndefined()
    })

    it('falls back to a generic error and clears it after a successful retry', async () => {
        vi.spyOn(SettingsApi, 'configureSendingDomain').mockRejectedValueOnce(null).mockResolvedValueOnce(sendingDomain)
        const wrapper = mountView(SendingDomainForm, { props: { sendingDomain } })

        await wrapper.get('form').trigger('submit')
        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The sending domain could not be saved')
        })

        await wrapper.get('form').trigger('submit')
        await vi.waitFor(() => {
            expect(wrapper.emitted('saved')).toEqual([[sendingDomain]])
        })
        expect(wrapper.find('.v-alert').exists()).toBe(false)
    })
})
