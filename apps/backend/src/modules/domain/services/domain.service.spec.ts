import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainService } from './domain.service'
import { DomainDkimService } from './domain-dkim.service'
import { DomainModel } from '../models/domain.model'

describe('DomainService', () => {
    let service: DomainService
    let create: ReturnType<typeof vi.fn>
    let createDkimForDomain: ReturnType<typeof vi.fn>

    const plainDomain = { domainId: 3, fqdn: 'example.com' }
    // The persisted model instance: carries a get({ plain: true }) like Sequelize rows.
    const createdDomain = {
        domainId: plainDomain.domainId,
        fqdn: plainDomain.fqdn,
        get: () => plainDomain,
    }

    beforeEach(async () => {
        create = vi.fn().mockResolvedValue(createdDomain)
        createDkimForDomain = vi.fn().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainService,
                { provide: DomainDkimService, useValue: { createDkimForDomain } },
                { provide: getModelToken(DomainModel), useValue: { create } },
            ],
        }).compile()

        service = module.get(DomainService)
    })

    it('persists the requested domain', async () => {
        await service.createDomain({ fqdn: 'example.com' })

        expect(create).toHaveBeenCalledWith({ fqdn: 'example.com' }, { returning: true })
    })

    it('provisions an active DKIM key for the newly created domain', async () => {
        await service.createDomain({ fqdn: 'example.com' })

        expect(createDkimForDomain).toHaveBeenCalledWith(createdDomain, true)
    })

    it('returns the persisted domain as a plain object', async () => {
        const result = await service.createDomain({ fqdn: 'example.com' })

        expect(result).toBe(plainDomain)
    })
})
