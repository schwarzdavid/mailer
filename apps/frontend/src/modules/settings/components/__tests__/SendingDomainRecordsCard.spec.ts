import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type DomainDnsRecordDto, type SendingDomainDto } from 'api'
import SendingDomainRecordsCard from '../SendingDomainRecordsCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

function buildRecord(
    use: DomainDnsRecordDto['use'],
    type: DomainDnsRecordDto['type'],
    host: string,
): DomainDnsRecordDto {
    return { current: null, host, status: 'invalid', type, use, value: `${use}-value` }
}

const sendingDomain: SendingDomainDto = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: '2001:db8::1',
    lastCheckedAt: null,
    records: [
        buildRecord('ptr', 'ptr', '10.113.0.203.in-addr.arpa'),
        buildRecord('dmarc', 'txt', '_dmarc.mail.sending-domain.org'),
        buildRecord('mx', 'mx', 'mail.sending-domain.org'),
        buildRecord('aaaa', 'aaaa', 'mail.sending-domain.org'),
        buildRecord('dkim', 'txt', 'mailer._domainkey.mail.sending-domain.org'),
        buildRecord('a', 'a', 'mail.sending-domain.org'),
        buildRecord('spf', 'txt', 'mail.sending-domain.org'),
    ],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('SendingDomainRecordsCard', () => {
    it('lists the records in setup order regardless of API order', () => {
        const wrapper = mountView(SendingDomainRecordsCard, { props: { sendingDomain } })

        const values = wrapper
            .findAll<HTMLInputElement>('input')
            .map((input) => input.element.value)
            .filter((value) => value.endsWith('-value'))
        expect(values).toEqual([
            'a-value',
            'aaaa-value',
            'mx-value',
            'spf-value',
            'dkim-value',
            'dmarc-value',
            'ptr-value',
        ])
    })

    it('titles and explains every record', () => {
        const wrapper = mountView(SendingDomainRecordsCard, { props: { sendingDomain } })

        expect(wrapper.text()).toContain('PTR (Reverse DNS)')
        expect(wrapper.text()).toContain('Routes bounce messages back to this server')
        expect(wrapper.text()).not.toContain('module.settings')
    })

    it('does not mutate the record order of the given sending domain', () => {
        const records = [...sendingDomain.records]
        mountView(SendingDomainRecordsCard, { props: { sendingDomain } })

        expect(sendingDomain.records).toEqual(records)
    })

    it('omits the last check time until the records were checked', () => {
        const wrapper = mountView(SendingDomainRecordsCard, { props: { sendingDomain } })

        expect(wrapper.text()).not.toContain('Last checked at')
    })

    it('shows when the records were last checked', () => {
        const wrapper = mountView(SendingDomainRecordsCard, {
            props: { sendingDomain: { ...sendingDomain, lastCheckedAt: new Date(2026, 9, 1, 8, 0, 30) } },
        })

        expect(wrapper.text()).toContain('Last checked at 01.10.2026 08:00:30')
    })

    it('refreshes the records', async () => {
        const refresh = vi.spyOn(SettingsApi, 'refreshSendingDomain').mockResolvedValue(sendingDomain)
        const wrapper = mountView(SendingDomainRecordsCard, { props: { sendingDomain } })

        const refreshButton = wrapper.findAll('button').find((button) => button.text() === 'Refresh')
        await refreshButton!.trigger('click')

        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    })
})
