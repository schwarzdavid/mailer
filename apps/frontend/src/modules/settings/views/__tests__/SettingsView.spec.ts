import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { SettingsApi, type SendingDomainDto } from 'api'
import SettingsView from '../SettingsView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { dnsRecord } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const configurationHint =
    'Set by MAIL_HOSTNAME, MAIL_SERVER_IPV4 and MAIL_SERVER_IPV6 in the server configuration. Change them there and restart the server.'

function sendingDomain(status: 'valid' | 'invalid' = 'valid', serverIpv6: string | null = null): SendingDomainDto {
    return {
        fqdn: 'mail.acme-mailer.com',
        serverIpv4: '203.0.113.10',
        serverIpv6,
        lastCheckedAt: null,
        records: [
            dnsRecord({ use: 'a', type: 'a', host: 'mail.acme-mailer.com', value: '203.0.113.10' }),
            dnsRecord({ use: 'dkim', status }),
        ],
    }
}

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('SettingsView', () => {
    it('shows the sending domain and its addresses read-only', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({
            sendingDomain: sendingDomain('valid', '2001:db8::10'),
        })
        const wrapper = mountInApp(SettingsView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('mail.acme-mailer.com'))
        expect(wrapper.text()).toContain('203.0.113.10')
        expect(wrapper.text()).toContain('2001:db8::10')
        expect(wrapper.text()).toContain(configurationHint)
        expect(wrapper.find('input').exists()).toBe(false)
        expect(wrapper.find('form').exists()).toBe(false)
    })

    it('shows a success state when every record is valid', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: sendingDomain() })
        const wrapper = mountInApp(SettingsView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('All 2 records are valid'))
        expect(findButton(wrapper, 'Check again')).toBeDefined()
    })

    it('shows the sending domain without the check action to readers', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: sendingDomain() })
        const wrapper = mountInApp(SettingsView, {}, [{ action: 'read', subject: 'Settings' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('mail.acme-mailer.com'))
        expect(wrapper.text()).toContain('203.0.113.10')
        expect(wrapper.find('input').exists()).toBe(false)
        expect(findButton(wrapper, 'Check again')).toBeUndefined()
    })

    it('offers no configuration while no sending domain exists', async () => {
        const getSettings = vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountInApp(SettingsView)

        await vi.waitFor(() => expect(getSettings).toHaveBeenCalled())
        await flushPromises()
        expect(wrapper.text()).not.toContain('Loading settings')
        expect(wrapper.find('input').exists()).toBe(false)
        expect(findButton(wrapper, 'Check again')).toBeUndefined()
    })

    it('offers a retry when loading fails', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockRejectedValue(new Error('offline'))
        const wrapper = mountInApp(SettingsView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load settings"))
    })
})
