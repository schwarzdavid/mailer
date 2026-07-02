import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainService } from './domain.service'
import { DomainDkimService } from './domain-dkim.service'
import { DomainModel } from '../models/domain.model'

describe('DomainService', () => {
    let service: DomainService
    let create: ReturnType<typeof vi.fn>
    let createDkimForDomain: ReturnType<typeof vi.fn>

    const plainDomain = { domainId: 3, fqdn: 'example.com' }
    // The persisted model instance: carries get({ plain: true }) like a Sequelize row.
    const createdDomain = {
        domainId: plainDomain.domainId,
        fqdn: plainDomain.fqdn,
        get: () => ({ ...plainDomain }),
    }
    const dkim = {
        dkimId: 55,
        domainId: 3,
        selector: 's1',
        publicKey: 'public-key',
        privateKey: 'encrypted-key',
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

        create = vi.fn().mockResolvedValue(createdDomain)
        createDkimForDomain = vi.fn().mockResolvedValue(dkim)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainService,
                { provide: DomainDkimService, useValue: { createDkimForDomain } },
                { provide: getModelToken(DomainModel), useValue: { create } },
            ],
        }).compile()

        service = module.get(DomainService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('persists the requested domain', async () => {
        await service.createDomain({ fqdn: 'example.com' })

        expect(create).toHaveBeenCalledWith({ fqdn: 'example.com' }, { returning: true })
    })

    it('provisions an active DKIM key for the newly created domain', async () => {
        await service.createDomain({ fqdn: 'example.com' })

        expect(createDkimForDomain).toHaveBeenCalledWith(createdDomain, true)
    })

    it('returns the persisted domain enriched with its active DKIM key', async () => {
        const result = await service.createDomain({ fqdn: 'example.com' })

        expect(result).toMatchObject({ domainId: 3, fqdn: 'example.com', activeDkimId: 55 })
        expect(result.activeDkim).toBe(dkim)
        expect(result.dkims).toEqual([dkim])
    })
})
