import { Test, TestingModule } from '@nestjs/testing'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PermissionCacheService } from './permission-cache.service'

describe('PermissionCacheService', () => {
    let service: PermissionCacheService
    let del: Mock<(key: string) => Promise<boolean>>

    beforeEach(async () => {
        del = vi.fn<typeof del>().mockResolvedValue(true)

        const module: TestingModule = await Test.createTestingModule({
            providers: [PermissionCacheService, { provide: CACHE_MANAGER, useValue: { del } }],
        }).compile()

        service = module.get(PermissionCacheService)
    })

    it('drops both cache entries of the user', async () => {
        await service.invalidateUser(7)

        expect(del).toHaveBeenCalledWith('auth:user:7')
        expect(del).toHaveBeenCalledWith('auth:permissions:7')
    })
})
