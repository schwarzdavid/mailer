import { describe, expect, it } from 'vitest'
import {
    evaluateDmarcRecord,
    evaluateExactRecord,
    evaluateRecord,
    evaluateSpfRecord,
    type RecordEvaluation,
} from './txt-record-check.js'
import { DomainDnsRecordIssue, DomainDnsRecordStatus, DomainDnsRecordUse } from '../interfaces/domain-dns.interface.js'

describe('evaluateSpfRecord', () => {
    const expected = 'v=spf1 include:mx.example.com ~all'

    it('accepts a merged record with extra mechanisms and a different qualifier', () => {
        expect(evaluateSpfRecord(expected, ['v=spf1 ip4:192.0.2.1 INCLUDE:mx.example.com -all'])).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: 'v=spf1 ip4:192.0.2.1 INCLUDE:mx.example.com -all',
            issue: null,
        })
    })

    it('accepts a record without an all term', () => {
        expect(evaluateSpfRecord(expected, ['v=spf1 include:mx.example.com'])).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: 'v=spf1 include:mx.example.com',
            issue: null,
        })
    })

    it('reports a record that lacks the include as incomplete', () => {
        expect(evaluateSpfRecord(expected, ['v=spf1 ip4:192.0.2.1 ~all'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'v=spf1 ip4:192.0.2.1 ~all',
            issue: DomainDnsRecordIssue.INCOMPLETE,
        })
    })

    it('reports several SPF records as multiple', () => {
        expect(
            evaluateSpfRecord(expected, ['v=spf1 include:mx.example.com ~all', 'v=spf1 ip4:192.0.2.1 -all']),
        ).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'v=spf1 include:mx.example.com ~all',
            issue: DomainDnsRecordIssue.MULTIPLE,
        })
    })

    it('ignores non-SPF TXT values and reports missing', () => {
        expect(evaluateSpfRecord(expected, ['google-site-verification=x'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'google-site-verification=x',
            issue: DomainDnsRecordIssue.MISSING,
        })
    })

    it('reports missing with a null current value when nothing resolved', () => {
        expect(evaluateSpfRecord(expected, [])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: null,
            issue: DomainDnsRecordIssue.MISSING,
        })
    })

    it('picks the SPF record among unrelated TXT values', () => {
        expect(
            evaluateSpfRecord(expected, ['google-site-verification=x', 'v=spf1 include:mx.example.com ~all']),
        ).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: 'v=spf1 include:mx.example.com ~all',
            issue: null,
        })
    })

    it('does not treat a value that merely starts with v=spf1 as an SPF record', () => {
        expect(evaluateSpfRecord(expected, ['v=spf10 include:mx.example.com'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'v=spf10 include:mx.example.com',
            issue: DomainDnsRecordIssue.MISSING,
        })
    })

    it('requires every ip mechanism of a platform record', () => {
        const platformExpected = 'v=spf1 ip4:203.0.113.10 ip6:2001:db8::10 -all'

        expect(evaluateSpfRecord(platformExpected, ['v=spf1 ip4:203.0.113.10 -all'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'v=spf1 ip4:203.0.113.10 -all',
            issue: DomainDnsRecordIssue.INCOMPLETE,
        })
        expect(evaluateSpfRecord(platformExpected, ['v=spf1 ip6:2001:db8::10 ip4:203.0.113.10 ~all'])).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: 'v=spf1 ip6:2001:db8::10 ip4:203.0.113.10 ~all',
            issue: null,
        })
    })
})

describe('evaluateDmarcRecord', () => {
    const expected = 'v=DMARC1; p=none;'

    it('reports missing when no DMARC record resolved', () => {
        expect(evaluateDmarcRecord(expected, [])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: null,
            issue: DomainDnsRecordIssue.MISSING,
        })
        expect(evaluateDmarcRecord(expected, ['some-other=value'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'some-other=value',
            issue: DomainDnsRecordIssue.MISSING,
        })
    })

    it('accepts a stricter policy with extra tags', () => {
        expect(evaluateDmarcRecord(expected, ['v=DMARC1; p=quarantine; rua=mailto:a@example.org'])).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: 'v=DMARC1; p=quarantine; rua=mailto:a@example.org',
            issue: null,
        })
    })

    it('accepts the generated value and a case-insensitive reject policy', () => {
        expect(evaluateDmarcRecord(expected, ['v=DMARC1; p=none;'])).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: 'v=DMARC1; p=none;',
            issue: null,
        })
        expect(evaluateDmarcRecord(expected, ['V=dmarc1;P=Reject'])).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: 'V=dmarc1;P=Reject',
            issue: null,
        })
    })

    it('reports a record without a p tag as incomplete', () => {
        expect(evaluateDmarcRecord(expected, ['v=DMARC1; sp=none'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'v=DMARC1; sp=none',
            issue: DomainDnsRecordIssue.INCOMPLETE,
        })
    })

    it('reports several DMARC records as multiple', () => {
        expect(evaluateDmarcRecord(expected, ['v=DMARC1; p=none', 'v=DMARC1; p=reject'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'v=DMARC1; p=none',
            issue: DomainDnsRecordIssue.MULTIPLE,
        })
    })
})

describe('evaluateExactRecord', () => {
    it('accepts a resolved value that matches exactly', () => {
        expect(evaluateExactRecord('203.0.113.10', ['198.51.100.1', '203.0.113.10'])).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: '203.0.113.10',
            issue: null,
        })
    })

    it('reports a different value as mismatch', () => {
        expect(evaluateExactRecord('203.0.113.10', ['198.51.100.1'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: '198.51.100.1',
            issue: DomainDnsRecordIssue.MISMATCH,
        })
    })

    it('reports no resolved value as missing', () => {
        expect(evaluateExactRecord('203.0.113.10', [])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: null,
            issue: DomainDnsRecordIssue.MISSING,
        })
    })
})

describe('evaluateRecord', () => {
    it('checks SPF records by content', () => {
        const expected: RecordEvaluation = {
            status: DomainDnsRecordStatus.VALID,
            current: 'v=spf1 a include:mx.example.com -all',
            issue: null,
        }

        expect(
            evaluateRecord(DomainDnsRecordUse.SPF, 'v=spf1 include:mx.example.com ~all', [
                'v=spf1 a include:mx.example.com -all',
            ]),
        ).toEqual(expected)
    })

    it('checks DMARC records by content', () => {
        expect(evaluateRecord(DomainDnsRecordUse.DMARC, 'v=DMARC1; p=none;', ['v=DMARC1; p=reject'])).toEqual({
            status: DomainDnsRecordStatus.VALID,
            current: 'v=DMARC1; p=reject',
            issue: null,
        })
    })

    it('checks every other record by exact match', () => {
        expect(evaluateRecord(DomainDnsRecordUse.DKIM, 'v=DKIM1; k=rsa; p=abc', ['v=DKIM1; k=rsa; p=xyz'])).toEqual({
            status: DomainDnsRecordStatus.INVALID,
            current: 'v=DKIM1; k=rsa; p=xyz',
            issue: DomainDnsRecordIssue.MISMATCH,
        })
    })
})
