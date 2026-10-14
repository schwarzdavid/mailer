import { describe, expect, it } from 'vitest'
import type { DomainDnsRecordDto } from 'api'
import DnsRecord from '../dns/DnsRecord.vue'
import DnsRecordsCard from '../dns/DnsRecordsCard.vue'
import { mountView } from '@/__tests__/support.ts'

const valid: DomainDnsRecordDto = {
    current: 'v=DMARC1; p=none;',
    host: '_dmarc.forms.acme.com',
    status: 'valid',
    type: 'txt',
    use: 'dmarc',
    value: 'v=DMARC1; p=none;',
}

const missing: DomainDnsRecordDto = {
    current: null,
    host: 's1._domainkey.forms.acme.com',
    status: 'invalid',
    type: 'txt',
    use: 'dkim',
    value: 'v=DKIM1; k=rsa; p=MIIB',
}

const different: DomainDnsRecordDto = {
    current: 'v=spf1 include:_spf.google.com ~all',
    host: 'forms.acme.com',
    status: 'invalid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:mail.acme-mailer.com ~all',
}

describe('DnsRecord', () => {
    it('shows name, type, purpose and status', () => {
        const wrapper = mountView(DnsRecord, { props: { record: valid } })

        expect(wrapper.text()).toContain('DMARC')
        expect(wrapper.text()).toContain('TXT')
        expect(wrapper.text()).toContain('Tells receivers what to do')
        expect(wrapper.text()).toContain('Valid')
        expect(wrapper.text()).not.toContain('Found a different value')
    })

    it('explains a missing record', () => {
        const wrapper = mountView(DnsRecord, { props: { record: missing } })

        expect(wrapper.text()).toContain('Invalid')
        expect(wrapper.text()).toContain('No record found at this host yet.')
    })

    it('shows what DNS returns when the value differs', () => {
        const wrapper = mountView(DnsRecord, { props: { record: different } })

        expect(wrapper.text()).toContain('Found a different value')
        expect(wrapper.text()).toContain('v=spf1 include:_spf.google.com ~all')
        expect(wrapper.text()).toContain('existing SPF record')
    })
})

describe('DnsRecordsCard', () => {
    it('summarizes how many records are valid', () => {
        const wrapper = mountView(DnsRecordsCard, { props: { records: [valid, missing, different] } })

        expect(wrapper.text()).toContain('1 of 3 records valid')
        expect(wrapper.text()).toContain('Not checked yet')
    })

    it('emits check from Check again', async () => {
        const wrapper = mountView(DnsRecordsCard, { props: { records: [valid] } })

        const button = wrapper.findAll('button').find((candidate) => candidate.text() === 'Check again')
        await button!.trigger('click')

        expect(wrapper.emitted('check')).toHaveLength(1)
    })

    it('hides Check again without permission', () => {
        const wrapper = mountView(DnsRecordsCard, { props: { records: [valid], canCheck: false } })

        expect(wrapper.findAll('button').some((candidate) => candidate.text() === 'Check again')).toBe(false)
    })
})
