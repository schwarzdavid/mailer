import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { BadRequestException, Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DomainService } from './domain.service'
import { DomainDkimService } from './domain-dkim.service'
import { DomainDnsService } from './domain-dns.service'
import { DomainModel } from '../models/domain.model'
import { Domain } from '../interfaces/domain.interface'
import { DomainDkim, DomainDkimAlgorithm } from '../interfaces/domain-dkim.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'

type DomainRow = Domain & { get(options: { plain: true }): Domain }

const domainRow = (plain: Domain): DomainRow => ({ ...plain, get: () => ({ ...plain }) })

describe('DomainService', () => {
    let service: DomainService
    let create: Mock<(values: Pick<Domain, 'fqdn' | 'rootDomain'>, options: { returning: true }) => Promise<DomainRow>>
    let findAll: Mock<() => Promise<DomainRow[]>>
    let findByPk: Mock<(id: string, options: { rejectOnEmpty: true }) => Promise<DomainRow>>
    let createDkimForDomain: Mock<DomainDkimService['createDkimForDomain']>
    let createDefaultDnsRecords: Mock<DomainDnsService['createDefaultDnsRecords']>

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

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        create = vi.fn<typeof create>().mockResolvedValue(domainRow(persistedDomain))
        findAll = vi.fn<typeof findAll>().mockResolvedValue([domainRow(persistedDomain)])
        findByPk = vi.fn<typeof findByPk>().mockResolvedValue(domainRow(persistedDomain))
        createDkimForDomain = vi.fn<typeof createDkimForDomain>().mockResolvedValue(dkim)
        createDefaultDnsRecords = vi.fn<typeof createDefaultDnsRecords>().mockResolvedValue(dnsRecords)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainService,
                { provide: DomainDkimService, useValue: { createDkimForDomain } },
                { provide: DomainDnsService, useValue: { createDefaultDnsRecords } },
                { provide: getModelToken(DomainModel), useValue: { create, findAll, findByPk } },
            ],
        }).compile()

        service = module.get(DomainService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('createDomain', () => {
        it('persists the requested domain with its resolved root domain', async () => {
            await service.createDomain('example.com')

            expect(create).toHaveBeenCalledWith({ fqdn: 'example.com', rootDomain: 'example.com' }, { returning: true })
        })

        it('resolves the root domain from a subdomain', async () => {
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

        it('provisions an active DKIM key for the newly created domain', async () => {
            await service.createDomain('example.com')

            expect(createDkimForDomain).toHaveBeenCalledWith(expect.objectContaining({ domainId: 3 }), true)
        })

        it('provisions default DNS records from the domain and its new key', async () => {
            await service.createDomain('example.com')

            expect(createDefaultDnsRecords).toHaveBeenCalledWith(expect.objectContaining({ domainId: 3 }), dkim)
        })

        it('returns the persisted domain enriched with its DKIM key and DNS records', async () => {
            const result = await service.createDomain('example.com')

            expect(result).toMatchObject({ domainId: 3, fqdn: 'example.com', rootDomain: 'example.com', activeDkimId: 55 })
            expect(result.activeDkim).toBe(dkim)
            expect(result.dkims).toEqual([dkim])
            expect(result.dnsRecords).toBe(dnsRecords)
        })
    })

    describe('getDomains', () => {
        it('returns every persisted domain as a plain object', async () => {
            const other: Domain = { ...persistedDomain, domainId: 4, fqdn: 'other.com', rootDomain: 'other.com' }
            findAll.mockResolvedValue([domainRow(persistedDomain), domainRow(other)])

            const result = await service.getDomains()

            expect(result).toEqual([persistedDomain, other])
        })
    })

    describe('getDomainById', () => {
        it('looks up the domain by primary key and rejects when it is missing', async () => {
            await service.getDomainById('3')

            expect(findByPk).toHaveBeenCalledWith('3', { rejectOnEmpty: true })
        })

        it('returns the requested domain as a plain object', async () => {
            const result = await service.getDomainById('3')

            expect(result).toEqual(persistedDomain)
        })
    })
})