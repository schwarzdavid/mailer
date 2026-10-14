import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi } from 'api'
import { useDomainRefreshMutation } from '../useDomainRefreshMutation.ts'
import { useDomainQuery } from '../../queries/useDomainQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { domain, domainDetail } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useDomainRefreshMutation', () => {
    it('refreshes the records of the given domain', async () => {
        const refresh = vi.spyOn(DomainApi, 'refreshDomainRecords').mockResolvedValue(domain())
        const { result, unmount } = withVueQuery(() => useDomainRefreshMutation())

        await result.mutateAsync(5)

        expect(refresh).toHaveBeenCalledWith({ path: { domainId: 5 } })
        unmount()
    })

    it('updates the records in the cached detail and keeps its projects', async () => {
        const refreshed = domain({ lastCheckedAt: new Date('2026-10-01T12:00:00.000Z') })
        vi.spyOn(DomainApi, 'refreshDomainRecords').mockResolvedValue(refreshed)
        const { result, queryClient, unmount } = withVueQuery(() => useDomainRefreshMutation())
        const projects = [{ projectId: 1, name: 'Acme Website' }]
        queryClient.setQueryData(useDomainQuery(5).queryKey, domainDetail({ projects }))

        await result.mutateAsync(5)

        expect(queryClient.getQueryData(useDomainQuery(5).queryKey)).toEqual({ ...refreshed, projects })
        unmount()
    })
})
