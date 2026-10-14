import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DomainController } from './domain.controller.js'
import { DomainService } from '../services/domain.service.js'
import { DomainDnsService } from '../services/domain-dns.service.js'
import { PoliciesGuard } from '../../permission/guards/policies.guard.js'
import { Domain, DomainWithDkim, DomainWithProjects } from '../interfaces/domain.interface.js'
import { createMongoAbility } from '@casl/ability'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { DomainDkim, DomainDkimAlgorithm } from '../interfaces/domain-dkim.interface.js'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface.js'

const dnsRecord = (use: DomainDnsRecordUse, host: string, value: string): DomainDnsRecord => ({
    dnsId: 1,
    domainId: 1,
    type: DomainDnsRecordType.TXT,
    use,
    status: DomainDnsRecordStatus.INVALID,
    host,
    value,
    current: null,
    createdAt: new Date(),
    updatedAt: new Date(),
})

const dnsRecords: DomainDnsRecord[] = [
    dnsRecord(DomainDnsRecordUse.SPF, 'example.com', 'v=spf1 include:spf.schwarzdavid.email ~all'),
    dnsRecord(DomainDnsRecordUse.DKIM, 's1._domainkey.example.com', 'v=DKIM1; k=rsa; p=key'),
    dnsRecord(DomainDnsRecordUse.DMARC, '_dmarc.example.com', 'v=DMARC1; p=none;'),
]

describe('DomainController', () => {
    let controller: DomainController
    let createDomain: Mock<DomainService['createDomain']>
    let getDomains: Mock<DomainService['getDomains']>
    let getDomainWithProjects: Mock<DomainService['getDomainWithProjects']>
    let reloadDnsRecords: Mock<DomainDnsService['reloadDnsRecords']>
    let deleteUnusedDomain: Mock<DomainService['deleteUnusedDomain']>

    const activeDkim: DomainDkim = {
        dkimId: 7,
        domainId: 1,
        selector: 's1',
        publicKey: '',
        privateKey: '',
        keyBits: 2048,
        algorithm: DomainDkimAlgorithm.RSA,
        createdAt: new Date(),
    }

    const domain: Domain = {
        domainId: 1,
        fqdn: 'example.com',
        rootDomain: 'example.com',
        activeDkimId: 7,
        dnsRecords,
        lastCheckedAt: null,
    }

    const createdDomain: DomainWithDkim = {
        ...domain,
        activeDkim,
        dkims: [activeDkim],
    }

    const domainWithProjects: DomainWithProjects = {
        ...domain,
        projects: [{ projectId: 4, name: 'Acme' }],
    }

    const ability = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        createDomain = vi.fn<typeof createDomain>().mockResolvedValue(createdDomain)
        getDomains = vi.fn<typeof getDomains>().mockResolvedValue([domain])
        getDomainWithProjects = vi.fn<typeof getDomainWithProjects>().mockResolvedValue(domainWithProjects)
        reloadDnsRecords = vi.fn<typeof reloadDnsRecords>().mockResolvedValue(domain)
        deleteUnusedDomain = vi.fn<typeof deleteUnusedDomain>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [DomainController],
            providers: [
                {
                    provide: DomainService,
                    useValue: { createDomain, getDomains, getDomainWithProjects, deleteUnusedDomain },
                },
                { provide: DomainDnsService, useValue: { reloadDnsRecords } },
            ],
        })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
            .compile()

        controller = module.get(DomainController)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('is defined', () => {
        expect(controller).toBeDefined()
    })

    describe('createDomain', () => {
        it('delegates domain creation to the service', async () => {
            await controller.createDomain({ fqdn: 'example.com' })

            expect(createDomain).toHaveBeenCalledWith('example.com')
        })

        it('composes the created domain with its DNS records grouped by use', async () => {
            const result = await controller.createDomain({ fqdn: 'example.com' })

            expect(result).toMatchObject({ domainId: 1, fqdn: 'example.com', rootDomain: 'example.com' })
            expect(result.dns[DomainDnsRecordUse.SPF]).toMatchObject({
                host: 'example.com',
                use: DomainDnsRecordUse.SPF,
            })
            expect(result.dns[DomainDnsRecordUse.DKIM]).toMatchObject({
                host: 's1._domainkey.example.com',
                use: DomainDnsRecordUse.DKIM,
            })
            expect(result.dns[DomainDnsRecordUse.DMARC]).toMatchObject({
                host: '_dmarc.example.com',
                use: DomainDnsRecordUse.DMARC,
            })
        })
    })

    describe('getDomains', () => {
        it('returns every domain with its DNS records grouped by use', async () => {
            const result = await controller.getDomains()

            expect(getDomains).toHaveBeenCalledOnce()
            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({ domainId: 1, fqdn: 'example.com' })
            expect(result[0]?.dns[DomainDnsRecordUse.SPF]).toMatchObject({ use: DomainDnsRecordUse.SPF })
        })
    })

    describe('getDomain', () => {
        it('looks up the requested domain by id and groups its DNS records by use', async () => {
            const result = await controller.getDomain(1, ability)

            expect(getDomainWithProjects).toHaveBeenCalledWith(1, ability)
            expect(result).toMatchObject({ domainId: 1, fqdn: 'example.com' })
            expect(result.dns[DomainDnsRecordUse.DMARC]).toMatchObject({ use: DomainDnsRecordUse.DMARC })
        })

        it('lists the projects the domain is assigned to', async () => {
            const result = await controller.getDomain(1, ability)

            expect(result.projects).toEqual([{ projectId: 4, name: 'Acme' }])
        })
    })

    describe('refreshDomainRecords', () => {
        it('reloads the DNS records for the requested domain and groups them by use', async () => {
            const result = await controller.refreshDomainRecords(1)

            expect(reloadDnsRecords).toHaveBeenCalledWith(1)
            expect(result).toMatchObject({ domainId: 1, fqdn: 'example.com' })
            expect(result.dns[DomainDnsRecordUse.SPF]).toMatchObject({ use: DomainDnsRecordUse.SPF })
        })
    })

    describe('deleteDomain', () => {
        it('delegates the guarded deletion to the service', async () => {
            await controller.deleteDomain(1)

            expect(deleteUnusedDomain).toHaveBeenCalledWith(1)
        })
    })
})
