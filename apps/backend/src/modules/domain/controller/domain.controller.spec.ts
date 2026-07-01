import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainController } from './domain.controller';
import { DomainService } from '../services/domain.service';

describe('DomainController', () => {
    let controller: DomainController;
    let createDomain: ReturnType<typeof vi.fn>;

    const created = { domainId: 1, fqdn: 'example.com' };

    beforeEach(async () => {
        createDomain = vi.fn().mockResolvedValue(created);

        const module: TestingModule = await Test.createTestingModule({
            controllers: [DomainController],
            providers: [{ provide: DomainService, useValue: { createDomain } }],
        }).compile();

        controller = module.get(DomainController);
    });

    it('is defined', () => {
        expect(controller).toBeDefined();
    });

    it('delegates domain creation to the service and returns the result', async () => {
        const dto = { fqdn: 'example.com' };

        const result = await controller.createDomain(dto);

        expect(createDomain).toHaveBeenCalledWith(dto);
        expect(result).toBe(created);
    });
});
