import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainController } from './domain.controller'
import { DomainService } from '../services/domain.service'
import { DomainDto } from '../dtos/domain.dto'

describe('DomainController', () => {
    let controller: DomainController
    let createDomain: ReturnType<typeof vi.fn>

    // The service speaks the internal domain shape, which carries fields the HTTP
    // response must not expose (e.g. activeDkimId).
    const created = { domainId: 1, fqdn: 'example.com', activeDkimId: 7 }

    beforeEach(async () => {
        createDomain = vi.fn().mockResolvedValue(created)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [DomainController],
            providers: [{ provide: DomainService, useValue: { createDomain } }],
        }).compile()

        controller = module.get(DomainController)
    })

    it('is defined', () => {
        expect(controller).toBeDefined()
    })

    it('delegates domain creation to the service', async () => {
        const dto = { fqdn: 'example.com' }

        await controller.createDomain(dto)

        expect(createDomain).toHaveBeenCalledWith(dto)
    })

    it('maps the created domain onto a response DTO without internal fields', async () => {
        const result = await controller.createDomain({ fqdn: 'example.com' })

        expect(result).toBeInstanceOf(DomainDto)
        expect(result).toEqual({ domainId: 1, fqdn: 'example.com' })
        expect('activeDkimId' in result).toBe(false)
    })
})
