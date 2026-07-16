import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { BadRequestException, Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { Op } from 'sequelize'
import { DomainService } from './domain.service'
import { DomainDkimService } from './domain-dkim.service'
import { DomainDnsService } from './domain-dns.service'
import { DomainModel } from '../models/domain.model'
import { DomainDkimModel } from '../models/domain-dkim.model'
import { Domain, DomainWithActiveDkim, SendingDomainIps } from '../interfaces/domain.interface'
import { DomainDkim, DomainDkimAlgorithm } from '../interfaces/domain-dkim.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'
import { SettingsModel } from '../../settings/models/settings.model'
import { Settings } from '../../settings/interfaces/settings.interface'

type DomainRow = Domain & { get(options: { plain: true }): Domain }

const domainRow = (plain: Domain): DomainRow => ({ ...plain, get: () => ({ ...plain }) })

describe('DomainService', () => {
    let service: DomainService
    let create: Mock<(values: Pick<Domain, 'fqdn' | 'rootDomain'>, options: { returning: true }) => Promise<DomainRow>>
    let findAll: Mock<() => Promise<DomainRow[]>>
    let findByPk: Mock<(id: number, options?: { rejectOnEmpty: true }) => Promise<DomainRow>>
    let findOne: Mock<(typeof DomainModel)['findOne']>
    let destroy: Mock<(options: { where: { domainId: number } }) => Promise<number>>
    let createDkimForDomain: Mock<DomainDkimService['createDkimForDomain']>
    let createDefaultDnsRecords: Mock<DomainDnsService['createDefaultDnsRecords']>
    let createSendingDomainDnsRecords: Mock<DomainDnsService['createSendingDomainDnsRecords']>
    let deleteRecordsForDomain: Mock<DomainDnsService['deleteRecordsForDomain']>
    let settingsFindOne: Mock<() => Promise<Settings | null>>

    const persistedDomain: Domain = {
        domainId: 3,
        fqdn: 'example.com',
        rootDomain: 'example.com',
        activeDkimId: 0,
        dnsRecords: [],
        lastCheckedAt: null,
    }

    const dkim: DomainDkim = {
        dkimId: 55,
        domainId: 3,
        selector: 's1',
        publicKey: 'public-key',
        privateKey: 'encrypted-key',
        algorithm: DomainDkimAlgorithm.RSA,
        keyBits: 2048,
        createdAt: new Date(),
    }

    const dnsRecords: DomainDnsRecord[] = [
        {
            dnsId: 1,
            domainId: 3,
            type: DomainDnsRecordType.TXT,
            use: DomainDnsRecordUse.SPF,
            status: DomainDnsRecordStatus.INVALID,
            host: 'example.com',
            value: 'v=spf1 include:spf.schwarzdavid.email ~all',
            current: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ]

    const settings: Settings = {
        settingId: 1,
        sendingDomainId: 10,
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const ips: SendingDomainIps = { serverIpv4: '203.0.113.10', serverIpv6: null }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        create = vi.fn<typeof create>().mockResolvedValue(domainRow(persistedDomain))
        findAll = vi.fn<typeof findAll>().mockResolvedValue([domainRow(persistedDomain)])
        findByPk = vi.fn<typeof findByPk>().mockResolvedValue(domainRow(persistedDomain))
        findOne = vi.fn<typeof findOne>()
        destroy = vi.fn<typeof destroy>().mockResolvedValue(1)
        createDkimForDomain = vi.fn<typeof createDkimForDomain>().mockResolvedValue(dkim)
        createDefaultDnsRecords = vi.fn<typeof createDefaultDnsRecords>().mockResolvedValue(dnsRecords)
        createSendingDomainDnsRecords = vi.fn<typeof createSendingDomainDnsRecords>().mockResolvedValue(dnsRecords)
        deleteRecordsForDomain = vi.fn<typeof deleteRecordsForDomain>().mockResolvedValue(undefined)
        settingsFindOne = vi.fn<typeof settingsFindOne>().mockResolvedValue(null)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainService,
                { provide: DomainDkimService, useValue: { createDkimForDomain } },
                {
                    provide: DomainDnsService,
                    useValue: { createDefaultDnsRecords, createSendingDomainDnsRecords, deleteRecordsForDomain },
                },
                { provide: getModelToken(DomainModel), useValue: { create, findAll, findByPk, findOne, destroy } },
                { provide: getModelToken(SettingsModel), useValue: { findOne: settingsFindOne } },
            ],
        }).compile()

        service = module.get(DomainService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('createDomain', () => {
        it('persists the requested domain with its resolved root domain', async () => {
            settingsFindOne.mockResolvedValue(settings)

            await service.createDomain('example.com')

            expect(create).toHaveBeenCalledWith({ fqdn: 'example.com', rootDomain: 'example.com' }, { returning: true })
        })

        it('resolves the root domain from a subdomain', async () => {
            settingsFindOne.mockResolvedValue(settings)

            await service.createDomain('mail.example.com')

            expect(create).toHaveBeenCalledWith(
                { fqdn: 'mail.example.com', rootDomain: 'example.com' },
                { returning: true },
            )
        })

        it('rejects an fqdn without a resolvable root domain', async () => {
            await expect(service.createDomain('localhost')).rejects.toBeInstanceOf(BadRequestException)

            expect(create).not.toHaveBeenCalled()
            expect(createDkimForDomain).not.toHaveBeenCalled()
        })

        it('rejects domain creation while no sending domain is configured', async () => {
            settingsFindOne.mockResolvedValue(null)

            await expect(service.createDomain('example.com')).rejects.toBeInstanceOf(BadRequestException)

            expect(create).not.toHaveBeenCalled()
            expect(createDkimForDomain).not.toHaveBeenCalled()
        })

        it('provisions an active DKIM key for the newly created domain', async () => {
            settingsFindOne.mockResolvedValue(settings)

            await service.createDomain('example.com')

            expect(createDkimForDomain).toHaveBeenCalledWith(expect.objectContaining({ domainId: 3 }), true)
        })

        it('provisions default DNS records from the domain and its new key', async () => {
            settingsFindOne.mockResolvedValue(settings)

            await service.createDomain('example.com')

            expect(createDefaultDnsRecords).toHaveBeenCalledWith(expect.objectContaining({ domainId: 3 }), dkim)
        })

        it('returns the persisted domain enriched with its DKIM key and DNS records', async () => {
            settingsFindOne.mockResolvedValue(settings)

            const result = await service.createDomain('example.com')

            expect(result).toMatchObject({
                domainId: 3,
                fqdn: 'example.com',
                rootDomain: 'example.com',
                activeDkimId: 55,
            })
            expect(result.activeDkim).toBe(dkim)
            expect(result.dkims).toEqual([dkim])
            expect(result.dnsRecords).toBe(dnsRecords)
        })
    })

    describe('createSendingDomain', () => {
        it('persists the domain, provisions dkim and creates the sending record set', async () => {
            const result = await service.createSendingDomain('mail.sending-domain.org', ips)

            expect(create).toHaveBeenCalledWith(
                { fqdn: 'mail.sending-domain.org', rootDomain: 'sending-domain.org' },
                { returning: true },
            )
            expect(createDkimForDomain).toHaveBeenCalledWith(expect.objectContaining({ domainId: 3 }), true)
            expect(createSendingDomainDnsRecords).toHaveBeenCalledWith(
                expect.objectContaining({ domainId: 3 }),
                dkim,
                ips,
            )
            expect(result.dnsRecords).toBe(dnsRecords)
            expect(result.activeDkimId).toBe(55)
        })

        it('rejects an fqdn without a resolvable root domain', async () => {
            await expect(service.createSendingDomain('localhost', ips)).rejects.toBeInstanceOf(BadRequestException)
            expect(create).not.toHaveBeenCalled()
        })
    })

    describe('recreateSendingDomainRecords', () => {
        it('replaces the record set of the existing sending domain', async () => {
            const activeDkim: DomainDkim = { ...dkim, dkimId: 7, domainId: 1 }
            const sendingDomain: DomainWithActiveDkim = {
                domainId: 1,
                fqdn: 'mail.sending-domain.org',
                rootDomain: 'sending-domain.org',
                activeDkimId: 7,
                dnsRecords: [],
                lastCheckedAt: null,
                activeDkim,
            }
            findOne.mockResolvedValue({ activeDkim, get: () => sendingDomain } as unknown as DomainModel)

            const result = await service.recreateSendingDomainRecords('mail.sending-domain.org', ips)

            expect(deleteRecordsForDomain).toHaveBeenCalledWith(1)
            expect(createSendingDomainDnsRecords).toHaveBeenCalledWith(sendingDomain, activeDkim, ips)
            expect(result.dnsRecords).toBe(dnsRecords)
        })

        it('rejects when no sending domain exists for the fqdn', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.recreateSendingDomainRecords('mail.sending-domain.org', ips)).rejects.toBeInstanceOf(
                BadRequestException,
            )
            expect(deleteRecordsForDomain).not.toHaveBeenCalled()
        })
    })

    describe('getDomains', () => {
        it('returns every persisted domain as a plain object', async () => {
            const other: Domain = { ...persistedDomain, domainId: 4, fqdn: 'other.com', rootDomain: 'other.com' }
            findAll.mockResolvedValue([domainRow(persistedDomain), domainRow(other)])

            const result = await service.getDomains()

            expect(result).toEqual([persistedDomain, other])
        })

        it('excludes the configured sending domain', async () => {
            settingsFindOne.mockResolvedValue(settings)

            await service.getDomains()

            expect(findAll).toHaveBeenCalledWith({ where: { domainId: { [Op.ne]: 10 } } })
        })

        it('queries without a filter when nothing is configured', async () => {
            settingsFindOne.mockResolvedValue(null)

            await service.getDomains()

            expect(findAll).toHaveBeenCalledWith(undefined)
        })
    })

    describe('getDomainById', () => {
        it('looks up the domain by primary key and rejects when it is missing', async () => {
            await service.getDomainById(3)

            expect(findByPk).toHaveBeenCalledWith(3, { rejectOnEmpty: true })
        })

        it('returns the requested domain as a plain object', async () => {
            const result = await service.getDomainById(3)

            expect(result).toEqual(persistedDomain)
        })
    })

    describe('getConfiguredSendingDomain', () => {
        it('returns null when nothing is configured', async () => {
            settingsFindOne.mockResolvedValue(null)

            await expect(service.getConfiguredSendingDomain()).resolves.toBeNull()
        })

        it('returns the configured domain as a plain object', async () => {
            settingsFindOne.mockResolvedValue(settings)
            findByPk.mockResolvedValue(domainRow(persistedDomain))

            const result = await service.getConfiguredSendingDomain()

            expect(findByPk).toHaveBeenCalledWith(10)
            expect(result).toEqual(persistedDomain)
        })
    })

    describe('deleteDomain', () => {
        it('destroys the domain row', async () => {
            await service.deleteDomain(4)

            expect(destroy).toHaveBeenCalledWith({ where: { domainId: 4 } })
        })
    })

    describe('getSendingDomainByFqdn', () => {
        it('returns the domain with its active dkim as a plain object', async () => {
            const activeDkim: DomainDkim = {
                dkimId: 7,
                domainId: 1,
                selector: 's1',
                publicKey: 'pub',
                privateKey: 'v1.encrypted',
                algorithm: DomainDkimAlgorithm.RSA,
                keyBits: 2048,
                createdAt: new Date(),
            }
            const sendingDomain: DomainWithActiveDkim = {
                domainId: 1,
                fqdn: 'mail.example.com',
                rootDomain: 'example.com',
                activeDkimId: 7,
                dnsRecords: [],
                lastCheckedAt: null,
                activeDkim,
            }
            findOne.mockResolvedValue({
                activeDkim,
                get: () => sendingDomain,
            } as unknown as DomainModel)

            const result = await service.getSendingDomainByFqdn('mail.example.com')

            expect(findOne).toHaveBeenCalledWith({
                where: { fqdn: 'mail.example.com' },
                include: [{ model: DomainDkimModel, as: 'activeDkim' }],
            })
            expect(result).toEqual(sendingDomain)
        })

        it('returns null when the domain does not exist', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.getSendingDomainByFqdn('unknown.example.com')).resolves.toBeNull()
        })

        it('returns null when the domain has no active dkim key', async () => {
            findOne.mockResolvedValue({ activeDkim: null, get: () => ({}) } as unknown as DomainModel)

            await expect(service.getSendingDomainByFqdn('mail.example.com')).resolves.toBeNull()
        })
    })
})
