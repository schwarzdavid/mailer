import { describe, expect, it } from 'vitest'
import type { DomainDnsRecordDto, DomainDto } from 'api'
import DomainVerificationChip from '../DomainVerificationChip.vue'
import { mountView } from '@/__tests__/support.ts'

const valid: DomainDnsRecordDto = {
    current: 'v=spf1 include:sending-domain.org -all',
    host: 'mail.example.org',
    status: 'valid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const invalid: DomainDnsRecordDto = { ...valid, current: null, status: 'invalid' }

function buildDomain(dns: DomainDto['dns']): DomainDto {
    return { domainId: 5, fqdn: 'mail.example.org', rootDomain: 'example.org', dns, lastCheckedAt: null }
}

describe('DomainVerificationChip', () => {
    it('shows a valid chip when every DNS record is valid', () => {
        const wrapper = mountView(DomainVerificationChip, {
            props: { domain: buildDomain({ spf: valid, dkim: valid, dmarc: valid }) },
        })

        expect(wrapper.text()).toBe('Valid')
        expect(wrapper.find('.mdi-check').exists()).toBe(true)
    })

    it.each(['spf', 'dkim', 'dmarc'] as const)('shows an invalid chip when only %s is invalid', (failing) => {
        const dns: DomainDto['dns'] = { spf: valid, dkim: valid, dmarc: valid }
        dns[failing] = invalid
        const wrapper = mountView(DomainVerificationChip, { props: { domain: buildDomain(dns) } })

        expect(wrapper.text()).toBe('Invalid')
        expect(wrapper.find('.mdi-alert').exists()).toBe(true)
    })
})
