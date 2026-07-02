import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainController } from './domain.controller'
import { DomainService } from '../services/domain.service'
import { DomainDnsService } from '../services/domain-dns.service'

describe('DomainController', () => {
    let controller: DomainController
    let createDomain: ReturnType<typeof vi.fn>
    let createDefaultDnsRecords: ReturnType<typeof vi.fn>

    const activeDkim = { dkimId: 7, domainId: 1, selector: 's1' }
    // The service returns the enriched internal domain. Stripping it to the HTTP
    // response shape is handled by the ClassSerializerInterceptor via @ResponseDto, so
    // that is covered by the DTO serialization tests / e2e, not these delegation tests.
    const created = { domainId: 1, fqdn: 'example.com', activeDkimId: 7, activeDkim, dkims: [activeDkim] }
    const dnsRecords = { spf: {}, dkim: {}, dmarc: {} }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        createDomain = vi.fn().mockResolvedValue(created)
        createDefaultDnsRecords = vi.fn().mockReturnValue(dnsRecords)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [DomainController],
            providers: [
                { provide: DomainService, useValue: { createDomain } },
                { provide: DomainDnsService, useValue: { createDefaultDnsRecords } },
            ],
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

        expect(createDomain).toHaveBeenCalledWith(dto)
    })

    it('composes the created domain with its default DNS records', async () => {
        const result = await controller.createDomain({ fqdn: 'example.com' })

        expect(createDefaultDnsRecords).toHaveBeenCalledWith(created, activeDkim)
        expect(result).toMatchObject({ domainId: 1, fqdn: 'example.com', dns: dnsRecords })
    })
})
