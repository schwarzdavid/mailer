import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainController } from './domain.controller'
import { DomainService } from '../services/domain.service'
import { DomainWithDkim } from '../interfaces/domain.interface'
import { DomainDkim, DomainDkimAlgorithm } from '../interfaces/domain-dkim.interface'
import { DomainDnsRecord, DomainDnsRecordUse } from '../interfaces/domain-dns.interface'

describe('DomainController', () => {
    let controller: DomainController
    let createDomain: ReturnType<typeof vi.fn>

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
    const createdDomain: DomainWithDkim = {
        domainId: 1,
        fqdn: 'example.com',
        activeDkimId: 7,
        activeDkim,
        dkims: [activeDkim],
        dnsRecords: [
            { use: DomainDnsRecordUse.SPF } as DomainDnsRecord,
            { use: DomainDnsRecordUse.DKIM } as DomainDnsRecord,
            { use: DomainDnsRecordUse.DMARC } as DomainDnsRecord,
        ],
        rootDomain: 'example.com',
        lastCheckedAt: null,
    }
    const dnsRecords = { spf: {}, dkim: {}, dmarc: {} }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        createDomain = vi.fn().mockResolvedValue(createdDomain)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [DomainController],
            providers: [{ provide: DomainService, useValue: { createDomain } }],
        }).compile()

        controller = module.get(DomainController)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('is defined', () => {
        expect(controller).toBeDefined()
    })

    it('delegates domain creation to the service', async () => {
        const dto = { fqdn: 'example.com' }

        await controller.createDomain(dto)

        expect(createDomain).toHaveBeenCalledWith(dto.fqdn)
    })

    it('composes the created domain with its default DNS records', async () => {
        const result = await controller.createDomain({ fqdn: 'example.com' })

        expect(result).toMatchObject({ domainId: 1, fqdn: 'example.com', dns: dnsRecords })
    })
})
