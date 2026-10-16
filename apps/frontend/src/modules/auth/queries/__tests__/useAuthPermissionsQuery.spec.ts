import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { AuthApi } from 'api'
import { useAuthPermissionsQuery } from '../useAuthPermissionsQuery.ts'
import { heldOnly } from '@/modules/roles/__tests__/roleFixtures.ts'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useAuthPermissionsQuery', () => {
    it('loads what the caller holds under the auth.permissions key', async () => {
        const held = heldOnly(['users.read'], ['read'])
        const spy = vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(held)
        const options = useAuthPermissionsQuery()

        await expect(new QueryClient().fetchQuery(options)).resolves.toEqual(held)
        expect(options.queryKey).toEqual(['auth.permissions'])
        expect(spy).toHaveBeenCalledTimes(1)
    })
})
