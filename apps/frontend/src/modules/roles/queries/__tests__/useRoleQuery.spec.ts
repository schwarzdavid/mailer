import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/vue-query'
import { RoleApi } from 'api'
import { useRoleQuery } from '../useRoleQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { allRoles } from '@/modules/roles/__tests__/roleFixtures.ts'

const [role] = allRoles().filter((candidate) => candidate.scope === 'project')

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useRoleQuery', () => {
    it('loads the role under its id key', async () => {
        if (!role) {
            throw new Error('missing project role fixture')
        }
        const getSpy = vi.spyOn(RoleApi, 'getRole').mockResolvedValue(role)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useRoleQuery(() => 2)))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(getSpy).toHaveBeenCalledWith({ path: { roleId: 2 } })
        expect(queryClient.getQueryData(['roles', 2])).toEqual(role)
        unmount()
    })

    it('is refreshed by an invalidation of the roles list key', async () => {
        if (!role) {
            throw new Error('missing project role fixture')
        }
        const getSpy = vi.spyOn(RoleApi, 'getRole').mockResolvedValue(role)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useRoleQuery(2)))
        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        await queryClient.invalidateQueries({ queryKey: ['roles'] })

        expect(getSpy).toHaveBeenCalledTimes(2)
        unmount()
    })
})
