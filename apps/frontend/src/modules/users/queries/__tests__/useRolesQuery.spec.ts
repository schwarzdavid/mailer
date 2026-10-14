import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { RoleApi, type RoleDto } from 'api'
import { useRolesQuery } from '../useRolesQuery.ts'

const roles: RoleDto[] = [
    { roleId: 1, name: 'Super Admin', type: 'super_admin', permissions: [] },
    { roleId: 3, name: 'User', type: 'user', permissions: ['domains.read'] },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useRolesQuery', () => {
    it('loads the roles under the roles key', async () => {
        const getRoles = vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        const options = useRolesQuery()

        await expect(new QueryClient().fetchQuery(options)).resolves.toEqual(roles)
        expect(options.queryKey).toEqual(['roles'])
        expect(getRoles).toHaveBeenCalledTimes(1)
    })
})
