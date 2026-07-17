import { Inject, Injectable } from '@nestjs/common'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { AUTH_PERMISSIONS_CACHE_PREFIX, AUTH_USER_CACHE_PREFIX } from '../permission.constants'

@Injectable()
export class PermissionCacheService {
    constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

    async invalidateUser(userId: number): Promise<void> {
        await Promise.all([
            this.cacheManager.del(AUTH_USER_CACHE_PREFIX + userId),
            this.cacheManager.del(AUTH_PERMISSIONS_CACHE_PREFIX + userId),
        ])
    }
}
