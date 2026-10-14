import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type SendingDomainDto } from 'api'
import SettingsView from '../SettingsView.vue'
import { findButton, mountInApp, overlayButton, overlayText } from '@/__tests__/support.ts'
import { dnsRecord } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>() }
})

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

function sendingDomain(status: 'valid' | 'invalid' = 'valid'): SendingDomainDto {
    return {
        fqdn: 'mail.acme-mailer.com',
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        lastCheckedAt: null,
        records: [
            dnsRecord({ use: 'a', type: 'a', host: 'mail.acme-mailer.com', value: '203.0.113.10' }),
            dnsRecord({ use: 'dkim', status }),
        ],
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('SettingsView', () => {
    it('shows the form without records while unconfigured', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountInApp(SettingsView)

        await vi.waitFor(() => expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true))
        expect(findButton(wrapper, 'Check again')).toBeUndefined()
    })

    it('prefills the form and shows a success state when every record is valid', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: sendingDomain() })
        const wrapper = mountInApp(SettingsView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('All 2 records are valid'))
        expect((wrapper.get('input[name="fqdn"]').element as HTMLInputElement).value).toBe('mail.acme-mailer.com')
    })

    it('asks before changing the sending domain', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: sendingDomain('invalid') })
        const configure = vi
            .spyOn(SettingsApi, 'configureSendingDomain')
            .mockResolvedValue({ ...sendingDomain('invalid'), fqdn: 'mail.fabrikam.com' })
        const wrapper = mountInApp(SettingsView)
        await vi.waitFor(() => expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true))

        await wrapper.get('input[name="fqdn"]').setValue('mail.fabrikam.com')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(overlayText()).toContain('Change the sending domain?'))
        expect(configure).not.toHaveBeenCalled()
        overlayButton('Change domain').click()

        await vi.waitFor(() =>
            expect(configure).toHaveBeenCalledWith({
                body: { fqdn: 'mail.fabrikam.com', serverIpv4: '203.0.113.10', serverIpv6: undefined },
            }),
        )
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Sending domain saved'))
    })

    it('keeps the input and explains a failed save', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        vi.spyOn(SettingsApi, 'configureSendingDomain').mockRejectedValue({ message: 'The IPv6 address was rejected' })
        const wrapper = mountInApp(SettingsView)
        await vi.waitFor(() => expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true))

        await wrapper.get('input[name="fqdn"]').setValue('mail.acme-mailer.com')
        await wrapper.get('input[name="serverIpv4"]').setValue('203.0.113.10')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(wrapper.text()).toContain('The IPv6 address was rejected'))
        expect(wrapper.text()).toContain('Unsaved changes')
    })

    it('shows values as text without update rights', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: sendingDomain() })
        const wrapper = mountInApp(SettingsView, {}, [{ action: 'read', subject: 'Settings' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('mail.acme-mailer.com'))
        expect(wrapper.find('input').exists()).toBe(false)
        expect(findButton(wrapper, 'Check again')).toBeUndefined()
    })

    it('offers a retry when loading fails', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockRejectedValue(new Error('offline'))
        const wrapper = mountInApp(SettingsView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load settings"))
    })
})
