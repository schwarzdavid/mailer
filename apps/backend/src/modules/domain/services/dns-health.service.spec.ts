import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DnsHealthService } from './dns-health.service'
import { DomainDnsService } from './domain-dns.service'
import { DomainModel } from '../models/domain.model'
import { Domain } from '../interfaces/domain.interface'

type DomainListRow = Pick<Domain, 'domainId' | 'fqdn'>

describe('DnsHealthService', () => {
    let service: DnsHealthService
    let findAll: Mock<() => Promise<DomainListRow[]>>
    let reloadDnsRecords: Mock<DomainDnsService['reloadDnsRecords']>

    const domains: DomainListRow[] = [
        { domainId: 1, fqdn: 'mail.sending-domain.org' },
        { domainId: 2, fqdn: 'example.com' },
    ]

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        findAll = vi.fn<typeof findAll>().mockResolvedValue(domains)
        reloadDnsRecords = vi.fn<typeof reloadDnsRecords>().mockResolvedValue({} as Domain)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DnsHealthService,
                { provide: DomainDnsService, useValue: { reloadDnsRecords } },
                { provide: getModelToken(DomainModel), useValue: { unscoped: () => ({ findAll }) } },
            ],
        }).compile()

        service = module.get(DnsHealthService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('reloads the records of every domain', async () => {
        await service.checkAllDomains()

        expect(reloadDnsRecords).toHaveBeenCalledTimes(2)
        expect(reloadDnsRecords).toHaveBeenCalledWith(1)
        expect(reloadDnsRecords).toHaveBeenCalledWith(2)
    })

    it('continues with the remaining domains when one check fails', async () => {
        reloadDnsRecords.mockRejectedValueOnce(new Error('resolver down'))

        await service.checkAllDomains()

        expect(reloadDnsRecords).toHaveBeenCalledTimes(2)
        expect(reloadDnsRecords).toHaveBeenLastCalledWith(2)
    })

    it('skips a round while a previous round is still running', async () => {
        let finishFirstReload!: (value: Domain) => void
        reloadDnsRecords.mockReturnValueOnce(
            new Promise<Domain>((resolve) => {
                finishFirstReload = resolve
            }),
        )

        const firstRound = service.checkAllDomains()
        await service.checkAllDomains()

        finishFirstReload({} as Domain)
        await firstRound

        expect(findAll).toHaveBeenCalledTimes(1)
    })

    it('logs instead of throwing when the domain listing fails', async () => {
        findAll.mockRejectedValue(new Error('db unavailable'))

        await expect(service.handleCheckInterval()).resolves.toBeUndefined()

        expect(reloadDnsRecords).not.toHaveBeenCalled()
    })
})
