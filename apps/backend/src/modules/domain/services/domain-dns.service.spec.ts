import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { resolve } from 'node:dns/promises'
import { DomainDnsService } from './domain-dns.service'
import { DomainDnsModel } from '../models/domain-dns.model'
import { DomainModel } from '../models/domain.model'
import { Domain } from '../interfaces/domain.interface'
import { DomainDkim, DomainDkimAlgorithm } from '../interfaces/domain-dkim.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordCreate,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'

vi.mock('node:dns/promises', () => ({ resolve: vi.fn() }))

const resolveTxt = vi.mocked(resolve)

type DnsRow = DomainDnsRecord & { get(options: { plain: true }): DomainDnsRecord }
type ReloadDnsRow = DomainDnsRecord & { save: Mock<() => Promise<void>> }
type DomainRow = Domain & { save: Mock<() => Promise<void>>; get(options: { plain: true }): Domain }

const dnsRow = (record: DomainDnsRecord): DnsRow => ({ ...record, get: () => ({ ...record }) })

const reloadDnsRow = (record: DomainDnsRecord): ReloadDnsRow => ({
    ...record,
    save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
})

const domainRow = (base: Domain): DomainRow => {
    const row: DomainRow = {
        ...base,
        save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        get: () => ({ ...row }),
    }
    return row
}

describe('DomainDnsService', () => {
    let service: DomainDnsService
    let create: Mock<(values: DomainDnsRecordCreate, options: { returning: true }) => Promise<DnsRow>>
    let findAll: Mock<(options: { where: { domainId: number } }) => Promise<ReloadDnsRow[]>>
    let findByPk: Mock<(id: number, options: { rejectOnEmpty: true }) => Promise<DomainRow>>
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

        create = vi
            .fn<typeof create>()
            .mockImplementation((values) =>
                Promise.resolve(
                    dnsRow({ ...values, dnsId: ++nextDnsId, createdAt: new Date(), updatedAt: new Date() }),
                ),
            )
        findAll = vi.fn<typeof findAll>()
        findByPk = vi.fn<typeof findByPk>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainDnsService,
                { provide: getModelToken(DomainModel), useValue: { findByPk } },
                { provide: getModelToken(DomainDnsModel), useValue: { create, findAll } },
            ],
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

    describe('reloadDnsRecords', () => {
        const dnsRecord = (overrides: Partial<DomainDnsRecord>): DomainDnsRecord => ({
            dnsId: 1,
            domainId: 3,
            type: DomainDnsRecordType.TXT,
            use: DomainDnsRecordUse.DKIM,
            status: DomainDnsRecordStatus.INVALID,
            host: 's1._domainkey.example.com',
            value: '',
            current: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        })

        it('reassembles a DKIM key split across multiple TXT strings without inserting a separator', async () => {
            const dkimValue = `v=DKIM1; k=rsa; p=${'A'.repeat(400)}`
            const chunkOne = dkimValue.slice(0, 255)
            const chunkTwo = dkimValue.slice(255)

            const record = reloadDnsRow(dnsRecord({ use: DomainDnsRecordUse.DKIM, value: dkimValue }))

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveTxt.mockResolvedValue([[chunkOne, chunkTwo]])

            await service.reloadDnsRecords(3)

            expect(record.current).toBe(dkimValue)
            expect(record.current).not.toContain(',')
            expect(record.status).toBe(DomainDnsRecordStatus.VALID)
            expect(record.save).toHaveBeenCalledOnce()
        })

        it('marks a record invalid when the resolved TXT value does not match', async () => {
            const record = reloadDnsRow(
                dnsRecord({
                    use: DomainDnsRecordUse.SPF,
                    status: DomainDnsRecordStatus.VALID,
                    host: 'example.com',
                    value: 'v=spf1 include:spf.schwarzdavid.email ~all',
                }),
            )

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveTxt.mockResolvedValue([['v=spf1 include:someone-else.example ~all']])

            await service.reloadDnsRecords(3)

            expect(record.status).toBe(DomainDnsRecordStatus.INVALID)
            expect(record.current).toBe('v=spf1 include:someone-else.example ~all')
        })

        it('records a missing TXT record as a null current value', async () => {
            const record = reloadDnsRow(dnsRecord({ value: 'v=DKIM1; k=rsa; p=abc' }))
            const notFound: NodeJS.ErrnoException = Object.assign(new Error('not found'), { code: 'ENOTFOUND' })

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveTxt.mockRejectedValue(notFound)

            await service.reloadDnsRecords(3)

            expect(record.current).toBeNull()
            expect(record.status).toBe(DomainDnsRecordStatus.INVALID)
        })
    })
})
