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
})
