import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { BadRequestException } from '@nestjs/common'
import { Op } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { resolve, resolve4, resolve6, resolveMx, reverse } from 'node:dns/promises'
import { DomainDnsService } from './domain-dns.service'
import { DomainDnsModel } from '../models/domain-dns.model'
import { DomainModel } from '../models/domain.model'
import { Domain, SendingDomainIps } from '../interfaces/domain.interface'
import { DomainDkim, DomainDkimAlgorithm } from '../interfaces/domain-dkim.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordCreate,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'
import { SettingsModel } from '../../settings/models/settings.model'
import { Settings } from '../../settings/interfaces/settings.interface'

vi.mock('node:dns/promises', () => ({
    resolve: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveMx: vi.fn(),
    reverse: vi.fn(),
}))

const resolveTxt = vi.mocked(resolve)
const resolveA = vi.mocked(resolve4)
const resolveAaaa = vi.mocked(resolve6)
const resolveMxRecords = vi.mocked(resolveMx)
const reversePtr = vi.mocked(reverse)

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
    let findByPk: Mock<(id: number, options?: { rejectOnEmpty: true }) => Promise<DomainRow>>
    let settingsFindOne: Mock<() => Promise<Settings | null>>
    let update: Mock<(typeof DomainDnsModel)['update']>
    let destroy: Mock<(options: { where: { domainId: number } }) => Promise<number>>
    let nextDnsId: number

    const domain: Domain = {
        domainId: 3,
        fqdn: 'example.com',
        rootDomain: 'example.com',
        activeDkimId: 55,
        dnsRecords: [],
        lastCheckedAt: null,
    }

    const settings: Settings = {
        settingId: 1,
        sendingDomainId: 10,
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const sendingDomain: Domain = {
        domainId: 10,
        fqdn: 'mail.sending-domain.org',
        rootDomain: 'sending-domain.org',
        activeDkimId: 77,
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
        findByPk = vi
            .fn<typeof findByPk>()
            .mockImplementation((id) => Promise.resolve(domainRow(id === 10 ? sendingDomain : domain)))
        settingsFindOne = vi.fn<typeof settingsFindOne>().mockResolvedValue(settings)
        update = vi.fn<typeof update>().mockResolvedValue([0])
        destroy = vi.fn<typeof destroy>().mockResolvedValue(0)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainDnsService,
                { provide: getModelToken(DomainModel), useValue: { findByPk } },
                { provide: getModelToken(DomainDnsModel), useValue: { create, findAll, update, destroy } },
                { provide: getModelToken(SettingsModel), useValue: { findOne: settingsFindOne } },
            ],
        }).compile()

        service = module.get(DomainDnsService)
    })

    it('rejects a DKIM key that belongs to a different domain', async () => {
        const foreignDkim: DomainDkim = { ...dkim, domainId: 99 }

        await expect(service.createDefaultDnsRecords(domain, foreignDkim)).rejects.toThrow(
            'Domain and DKIM do not match',
        )
        expect(create).not.toHaveBeenCalled()
    })

    it('persists exactly one record for SPF, DKIM and DMARC', async () => {
        await service.createDefaultDnsRecords(domain, dkim)

        expect(create).toHaveBeenCalledTimes(3)
        expect(create.mock.calls.map(([values]) => values.use)).toEqual(
            expect.arrayContaining([DomainDnsRecordUse.SPF, DomainDnsRecordUse.DKIM, DomainDnsRecordUse.DMARC]),
        )
    })

    it('builds the customer SPF record from the configured sending domain', async () => {
        await service.createDefaultDnsRecords(domain, dkim)

        expect(attrsFor(DomainDnsRecordUse.SPF)).toEqual({
            domainId: 3,
            host: 'example.com',
            value: 'v=spf1 include:mail.sending-domain.org ~all',
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

    describe('createDefaultDnsRecords without a configured sending domain', () => {
        it('rejects with a bad request', async () => {
            settingsFindOne.mockResolvedValue(null)

            await expect(service.createDefaultDnsRecords(domain, dkim)).rejects.toBeInstanceOf(BadRequestException)
            expect(create).not.toHaveBeenCalled()
        })
    })

    describe('createSendingDomainDnsRecords', () => {
        const sendingDkim: DomainDkim = { ...dkim, dkimId: 77, domainId: 10 }
        const ips: SendingDomainIps = { serverIpv4: '203.0.113.10', serverIpv6: null }

        it('creates a, mx, ip-based spf, dkim, dmarc and ptr records', async () => {
            await service.createSendingDomainDnsRecords(sendingDomain, sendingDkim, ips)

            expect(attrsFor(DomainDnsRecordUse.A)).toMatchObject({
                domainId: 10,
                host: 'mail.sending-domain.org',
                value: '203.0.113.10',
                type: DomainDnsRecordType.A,
            })
            expect(attrsFor(DomainDnsRecordUse.MX)).toMatchObject({
                host: 'mail.sending-domain.org',
                value: '10 mail.sending-domain.org',
                type: DomainDnsRecordType.MX,
            })
            expect(attrsFor(DomainDnsRecordUse.SPF)).toMatchObject({
                host: 'mail.sending-domain.org',
                value: 'v=spf1 ip4:203.0.113.10 -all',
                type: DomainDnsRecordType.TXT,
            })
            expect(attrsFor(DomainDnsRecordUse.PTR)).toMatchObject({
                host: '203.0.113.10',
                value: 'mail.sending-domain.org',
                type: DomainDnsRecordType.PTR,
            })
            expect(attrsFor(DomainDnsRecordUse.DKIM)).toMatchObject({
                host: 's1._domainkey.mail.sending-domain.org',
            })
            expect(attrsFor(DomainDnsRecordUse.DMARC)).toMatchObject({
                host: '_dmarc.mail.sending-domain.org',
                value: 'v=DMARC1; p=none;',
            })
            expect(create).toHaveBeenCalledTimes(6)
        })

        it('adds aaaa and a second ptr record when an ipv6 address is configured', async () => {
            await service.createSendingDomainDnsRecords(sendingDomain, sendingDkim, {
                serverIpv4: '203.0.113.10',
                serverIpv6: '2001:db8::1',
            })

            expect(attrsFor(DomainDnsRecordUse.AAAA)).toMatchObject({
                host: 'mail.sending-domain.org',
                value: '2001:db8::1',
                type: DomainDnsRecordType.AAAA,
            })
            expect(attrsFor(DomainDnsRecordUse.SPF)).toMatchObject({
                value: 'v=spf1 ip4:203.0.113.10 ip6:2001:db8::1 -all',
            })
            const ptrCalls = create.mock.calls.filter(([values]) => values.use === DomainDnsRecordUse.PTR)
            expect(ptrCalls.map(([values]) => values.host)).toEqual(['203.0.113.10', '2001:db8::1'])
            expect(create).toHaveBeenCalledTimes(8)
        })

        it('rejects a DKIM key that belongs to a different domain', async () => {
            await expect(service.createSendingDomainDnsRecords(sendingDomain, dkim, ips)).rejects.toThrow(
                'Domain and DKIM do not match',
            )
        })
    })

    describe('regenerateCustomerSpfRecords', () => {
        it('rewrites every customer spf record and resets its status', async () => {
            await service.regenerateCustomerSpfRecords(sendingDomain)

            expect(update).toHaveBeenCalledWith(
                {
                    value: 'v=spf1 include:mail.sending-domain.org ~all',
                    status: DomainDnsRecordStatus.INVALID,
                },
                {
                    where: {
                        use: DomainDnsRecordUse.SPF,
                        domainId: { [Op.ne]: 10 },
                    },
                },
            )
        })
    })

    describe('deleteRecordsForDomain', () => {
        it('destroys all records of the domain', async () => {
            await service.deleteRecordsForDomain(10)

            expect(destroy).toHaveBeenCalledWith({ where: { domainId: 10 } })
        })
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

        it('rethrows a DNS lookup error that is not a missing record', async () => {
            const record = reloadDnsRow(dnsRecord({ value: 'v=DKIM1; k=rsa; p=abc' }))
            const serverFailure: NodeJS.ErrnoException = Object.assign(new Error('server failure'), {
                code: 'ESERVFAIL',
            })

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveTxt.mockRejectedValue(serverFailure)

            await expect(service.reloadDnsRecords(3)).rejects.toBe(serverFailure)
        })

        it('accepts the expected TXT value even when unrelated TXT records exist on the host', async () => {
            const record = reloadDnsRow(
                dnsRecord({
                    use: DomainDnsRecordUse.SPF,
                    host: 'example.com',
                    value: 'v=spf1 include:mail.sending-domain.org ~all',
                }),
            )

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveTxt.mockResolvedValue([
                ['google-site-verification=abc'],
                ['v=spf1 include:mail.sending-domain.org ~all'],
            ])

            await service.reloadDnsRecords(3)

            expect(record.status).toBe(DomainDnsRecordStatus.VALID)
            expect(record.current).toBe('v=spf1 include:mail.sending-domain.org ~all')
        })

        it('treats ENODATA as a missing record', async () => {
            const record = reloadDnsRow(dnsRecord({ value: 'v=DKIM1; k=rsa; p=abc' }))
            const noData: NodeJS.ErrnoException = Object.assign(new Error('no data'), { code: 'ENODATA' })

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveTxt.mockRejectedValue(noData)

            await service.reloadDnsRecords(3)

            expect(record.current).toBeNull()
            expect(record.status).toBe(DomainDnsRecordStatus.INVALID)
        })

        it('resolves an A record against the expected server ip', async () => {
            const record = reloadDnsRow(
                dnsRecord({
                    type: DomainDnsRecordType.A,
                    use: DomainDnsRecordUse.A,
                    host: 'mail.sending-domain.org',
                    value: '203.0.113.10',
                }),
            )

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveA.mockResolvedValue(['203.0.113.10'])

            await service.reloadDnsRecords(3)

            expect(resolveA).toHaveBeenCalledWith('mail.sending-domain.org')
            expect(record.status).toBe(DomainDnsRecordStatus.VALID)
        })

        it('resolves an AAAA record against the expected server ip', async () => {
            const record = reloadDnsRow(
                dnsRecord({
                    type: DomainDnsRecordType.AAAA,
                    use: DomainDnsRecordUse.AAAA,
                    host: 'mail.sending-domain.org',
                    value: '2001:db8::1',
                }),
            )

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveAaaa.mockResolvedValue(['2001:db8::1'])

            await service.reloadDnsRecords(3)

            expect(resolveAaaa).toHaveBeenCalledWith('mail.sending-domain.org')
            expect(record.status).toBe(DomainDnsRecordStatus.VALID)
        })

        it('resolves an MX record by priority and exchange', async () => {
            const record = reloadDnsRow(
                dnsRecord({
                    type: DomainDnsRecordType.MX,
                    use: DomainDnsRecordUse.MX,
                    host: 'mail.sending-domain.org',
                    value: '10 mail.sending-domain.org',
                }),
            )

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            resolveMxRecords.mockResolvedValue([{ priority: 10, exchange: 'mail.sending-domain.org' }])

            await service.reloadDnsRecords(3)

            expect(record.status).toBe(DomainDnsRecordStatus.VALID)
        })

        it('resolves a PTR record through a reverse lookup of the ip host', async () => {
            const record = reloadDnsRow(
                dnsRecord({
                    type: DomainDnsRecordType.PTR,
                    use: DomainDnsRecordUse.PTR,
                    host: '203.0.113.10',
                    value: 'mail.sending-domain.org',
                }),
            )

            findByPk.mockResolvedValue(domainRow(domain))
            findAll.mockResolvedValue([record])
            reversePtr.mockResolvedValue(['mail.sending-domain.org'])

            await service.reloadDnsRecords(3)

            expect(reversePtr).toHaveBeenCalledWith('203.0.113.10')
            expect(record.status).toBe(DomainDnsRecordStatus.VALID)
        })
    })
})
