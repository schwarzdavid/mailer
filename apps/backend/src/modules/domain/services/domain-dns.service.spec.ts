import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DomainDnsService } from './domain-dns.service'
import { DomainDnsModel } from '../models/domain-dns.model'
import { Domain } from '../interfaces/domain.interface'
import { DomainDkim, DomainDkimAlgorithm } from '../interfaces/domain-dkim.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordCreate,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'

type DnsRow = DomainDnsRecord & { get(options: { plain: true }): DomainDnsRecord }

const dnsRow = (record: DomainDnsRecord): DnsRow => ({ ...record, get: () => ({ ...record }) })

describe('DomainDnsService', () => {
    let service: DomainDnsService
    let create: Mock<(values: DomainDnsRecordCreate, options: { returning: true }) => Promise<DnsRow>>
    let nextDnsId: number

    const domain: Domain = {
        domainId: 3,
        fqdn: 'example.com',
        rootDomain: 'example.com',
        activeDkimId: 55,
        dnsRecords: [],
        lastCheckedAt: null,
    }

    const dkim: DomainDkim = {
        dkimId: 55,
        domainId: 3,
        selector: 's1',
        publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBpublic\nKEYdata\n-----END PUBLIC KEY-----',
        privateKey: 'encrypted-key',
        algorithm: DomainDkimAlgorithm.RSA,
        keyBits: 2048,
        createdAt: new Date(),
    }

    const attrsFor = (use: DomainDnsRecordUse): DomainDnsRecordCreate | undefined =>
        create.mock.calls.find(([values]) => values.use === use)?.[0]

    beforeEach(async () => {
        nextDnsId = 0

        create = vi.fn<typeof create>().mockImplementation((values) =>
            Promise.resolve(dnsRow({ ...values, dnsId: ++nextDnsId, createdAt: new Date(), updatedAt: new Date() })),
        )

        const module: TestingModule = await Test.createTestingModule({
            providers: [DomainDnsService, { provide: getModelToken(DomainDnsModel), useValue: { create } }],
        }).compile()

        service = module.get(DomainDnsService)
    })

    it('rejects a DKIM key that belongs to a different domain', () => {
        const foreignDkim: DomainDkim = { ...dkim, domainId: 99 }

        expect(() => service.createDefaultDnsRecords(domain, foreignDkim)).toThrow('Domain and DKIM do not match')
        expect(create).not.toHaveBeenCalled()
    })

    it('persists exactly one record for SPF, DKIM and DMARC', async () => {
        await service.createDefaultDnsRecords(domain, dkim)

        expect(create).toHaveBeenCalledTimes(3)
        expect(create.mock.calls.map(([values]) => values.use)).toEqual(
            expect.arrayContaining([DomainDnsRecordUse.SPF, DomainDnsRecordUse.DKIM, DomainDnsRecordUse.DMARC]),
        )
    })

    it('builds the SPF record from the domain fqdn', async () => {
        await service.createDefaultDnsRecords(domain, dkim)

        expect(attrsFor(DomainDnsRecordUse.SPF)).toEqual({
            domainId: 3,
            host: 'example.com',
            value: 'v=spf1 include:spf.schwarzdavid.email ~all',
            use: DomainDnsRecordUse.SPF,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        })
    })

    it('builds the DKIM record from the selector and the stripped public key', async () => {
        await service.createDefaultDnsRecords(domain, dkim)

        expect(attrsFor(DomainDnsRecordUse.DKIM)).toMatchObject({
            domainId: 3,
            host: 's1._domainkey.example.com',
            value: 'v=DKIM1; k=rsa; p=MIIBpublicKEYdata',
            use: DomainDnsRecordUse.DKIM,
            type: DomainDnsRecordType.TXT,
        })
    })

    it('builds the DMARC record for the domain', async () => {
        await service.createDefaultDnsRecords(domain, dkim)

        expect(attrsFor(DomainDnsRecordUse.DMARC)).toMatchObject({
            domainId: 3,
            host: '_dmarc.example.com',
            value: 'v=DMARC1; p=none;',
            use: DomainDnsRecordUse.DMARC,
            type: DomainDnsRecordType.TXT,
        })
    })

    it('returns the persisted records as plain objects', async () => {
        const result = await service.createDefaultDnsRecords(domain, dkim)

        expect(result).toHaveLength(3)
        result.forEach((record) => expect(record.dnsId).toBeGreaterThan(0))
    })
})