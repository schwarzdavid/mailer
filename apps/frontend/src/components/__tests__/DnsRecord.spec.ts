import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { DomainDnsRecordDto } from 'api'
import DnsRecord from '../dns/DnsRecord.vue'
import DnsRecordsCard from '../dns/DnsRecordsCard.vue'
import { mountView } from '@/__tests__/support.ts'

const valid: DomainDnsRecordDto = {
    current: 'v=DMARC1; p=none;',
    issue: null,
    host: '_dmarc.forms.acme.com',
    status: 'valid',
    type: 'txt',
    use: 'dmarc',
    value: 'v=DMARC1; p=none;',
}

const missing: DomainDnsRecordDto = {
    current: null,
    issue: 'missing',
    host: 's1._domainkey.forms.acme.com',
    status: 'invalid',
    type: 'txt',
    use: 'dkim',
    value: 'v=DKIM1; k=rsa; p=MIIB',
}

const different: DomainDnsRecordDto = {
    current: 'v=spf1 include:_spf.google.com ~all',
    issue: 'incomplete',
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

    it('suggests a merged SPF record when the include is missing', async () => {
        const wrapper = mountView(DnsRecord, { props: { record: different } })

        expect(wrapper.text()).toContain('Found a different value')
        await wrapper.get('button.disclosure-box__summary').trigger('click')
        await nextTick()
        expect(wrapper.text()).toContain('v=spf1 include:_spf.google.com ~all')
        expect(wrapper.text()).toContain('This domain already has an SPF record.')
        expect(wrapper.text()).toContain('v=spf1 include:_spf.google.com include:mail.acme-mailer.com ~all')
    })

    it('names the copy buttons of the expected and the merged SPF value apart', async () => {
        const wrapper = mountView(DnsRecord, { props: { record: different } })

        await wrapper.get('button.disclosure-box__summary').trigger('click')
        await nextTick()
        const copyLabels = wrapper
            .findAll('button[aria-label]')
            .map((button) => button.attributes('aria-label'))
            .filter((label) => label?.startsWith('Copy '))
        expect(copyLabels).toContain('Copy value for SPF')
        expect(copyLabels).toContain('Copy merged value for SPF')
        expect(new Set(copyLabels).size).toBe(copyLabels.length)
    })

    it('asks to merge several SPF records', () => {
        const wrapper = mountView(DnsRecord, { props: { record: { ...different, issue: 'multiple' } } })

        expect(wrapper.text()).toContain('Several SPF records were found.')
        expect(wrapper.text()).not.toContain('Found a different value')
    })

    it('tells to replace a mismatching record', async () => {
        const wrapper = mountView(DnsRecord, {
            props: { record: { ...missing, current: 'v=DKIM1; p=OLD', issue: 'mismatch' } },
        })

        await wrapper.get('button.disclosure-box__summary').trigger('click')
        await nextTick()
        expect(wrapper.text()).toContain('v=DKIM1; p=OLD')
        expect(wrapper.text()).toContain('Replace the existing record with the value above.')
    })

    it('asks for a policy tag on an incomplete DMARC record', async () => {
        const wrapper = mountView(DnsRecord, {
            props: { record: { ...valid, current: 'v=DMARC1;', issue: 'incomplete', status: 'invalid' } },
        })

        await wrapper.get('button.disclosure-box__summary').trigger('click')
        await nextTick()
        expect(wrapper.text()).toContain('p=none, p=quarantine or p=reject')
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
