import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import DomainDnsCard from '../partials/DomainDnsCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

function buildRecord(use: DomainDnsRecordDto['use'], host: string, value: string): DomainDnsRecordDto {
    return { current: null, host, status: 'invalid', type: 'txt', use, value }
}

const domain: DomainDto = {
    domainId: 5,
    fqdn: 'mail.example.org',
    rootDomain: 'example.org',
    dns: {
        spf: buildRecord('spf', 'mail.example.org', 'v=spf1 include:sending-domain.org -all'),
        dkim: buildRecord('dkim', 'mailer._domainkey.mail.example.org', 'v=DKIM1; k=rsa; p=MIIB'),
        dmarc: buildRecord('dmarc', '_dmarc.mail.example.org', 'v=DMARC1; p=reject'),
    },
    lastCheckedAt: null,
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('DomainDnsCard', () => {
    it('lists the SPF, DKIM and DMARC records to configure in order', () => {
        const wrapper = mountView(DomainDnsCard, { props: { domain } })

        const values = wrapper.findAll('input').map((input) => (input.element as HTMLInputElement).value)
        expect(values).toEqual([
            'mail.example.org',
            'v=spf1 include:sending-domain.org -all',
            'mailer._domainkey.mail.example.org',
            'v=DKIM1; k=rsa; p=MIIB',
            '_dmarc.mail.example.org',
            'v=DMARC1; p=reject',
        ])
        expect(wrapper.text()).toContain('SPF')
        expect(wrapper.text()).toContain('DKIM')
        expect(wrapper.text()).toContain('DMARC')
    })

    it('omits the last check time for a domain that was never checked', () => {
        const wrapper = mountView(DomainDnsCard, { props: { domain } })

        expect(wrapper.text()).not.toContain('Last checked at')
    })

    it('shows when the records were last checked', () => {
        const wrapper = mountView(DomainDnsCard, {
            props: { domain: { ...domain, lastCheckedAt: new Date(2026, 9, 1, 14, 5, 9) } },
        })

        expect(wrapper.text()).toContain('Last checked at 01.10.2026 14:05:09')
    })

    it('refreshes the records of this domain', async () => {
        const refresh = vi.spyOn(DomainApi, 'refreshDomainRecords').mockResolvedValue(domain)
        const wrapper = mountView(DomainDnsCard, { props: { domain } })

        const refreshButton = wrapper.findAll('button').find((button) => button.text() === 'Refresh')
        await refreshButton!.trigger('click')

        await vi.waitFor(() => {
            expect(refresh).toHaveBeenCalledWith({ path: { domainId: 5 } })
        })
    })
})
