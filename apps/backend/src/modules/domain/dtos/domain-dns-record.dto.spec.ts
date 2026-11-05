import 'reflect-metadata'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { describe, expect, it } from 'vitest'
import { DomainDnsRecordDto } from './domain-dns-record.dto.js'
import {
    DomainDnsRecord,
    DomainDnsRecordIssue,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface.js'

const record = (overrides: Partial<DomainDnsRecord>): DomainDnsRecord => ({
    dnsId: 1,
    domainId: 1,
    type: DomainDnsRecordType.TXT,
    use: DomainDnsRecordUse.SPF,
    status: DomainDnsRecordStatus.INVALID,
    host: 'mx.example.com',
    value: 'v=spf1 ip4:192.0.2.1 -all',
    current: null,
    issue: DomainDnsRecordIssue.MISSING,
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
})

const serialize = (source: DomainDnsRecord): Record<string, unknown> =>
    instanceToPlain(
        plainToInstance(DomainDnsRecordDto, source, { excludeExtraneousValues: true, exposeDefaultValues: true }),
    )

describe('DomainDnsRecordDto', () => {
    it('splits an MX value into priority and mail server', () => {
        const mx = record({
            type: DomainDnsRecordType.MX,
            use: DomainDnsRecordUse.MX,
            value: '10 mx.example.com',
            current: '20 other.example.com',
            issue: DomainDnsRecordIssue.MISMATCH,
        })

        expect(serialize(mx)).toMatchObject({
            value: 'mx.example.com',
            priority: 10,
            current: '20 other.example.com',
        })
    })

    it('leaves the value of other records alone and has no priority', () => {
        expect(serialize(record({}))).toMatchObject({ value: 'v=spf1 ip4:192.0.2.1 -all', priority: null })
    })

    it('exposes only the public fields', () => {
        expect(Object.keys(serialize(record({}))).sort()).toEqual([
            'current',
            'host',
            'issue',
            'priority',
            'status',
            'type',
            'use',
            'value',
        ])
    })
})
