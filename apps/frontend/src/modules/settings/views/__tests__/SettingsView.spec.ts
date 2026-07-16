import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type SettingsDto } from 'api'
import SettingsView from '../SettingsView.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const configured: SettingsDto = {
    sendingDomain: {
        fqdn: 'mail.sending-domain.org',
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        lastCheckedAt: null,
        records: [
            {
                host: 'mail.sending-domain.org',
                type: 'a',
                use: 'a',
                value: '203.0.113.10',
                current: null,
                status: 'invalid',
            },
        ],
    },
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('SettingsView', () => {
    it('shows the sending domain form without a records card while unconfigured', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue({ sendingDomain: null })
        const wrapper = mountView(SettingsView)

        await vi.waitFor(() => {
            expect(wrapper.find('input[name="fqdn"]').exists()).toBe(true)
        })
        expect(wrapper.text()).not.toContain('DNS Records')
    })

    it('shows the prefilled form and the records card when configured', async () => {
        vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(configured)
        const wrapper = mountView(SettingsView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('DNS Records')
        })
        expect((wrapper.get('input[name="fqdn"]').element as HTMLInputElement).value).toBe('mail.sending-domain.org')
    })
})
