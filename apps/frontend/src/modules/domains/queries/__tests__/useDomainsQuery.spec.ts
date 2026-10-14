import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi } from 'api'
import { useDomainsQuery } from '../useDomainsQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { domain } from '@/__tests__/fixtures.ts'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useDomainsQuery', () => {
    it('loads every domain under the domains key', async () => {
        const domains = [domain()]
        const getDomains = vi.spyOn(DomainApi, 'getDomains').mockResolvedValue(domains)
        const { result, queryClient, unmount } = withVueQuery(() => useDomainsQuery())

        expect(result.queryKey).toEqual(['domains'])
        await expect(queryClient.fetchQuery(result)).resolves.toEqual(domains)
        expect(getDomains).toHaveBeenCalledTimes(1)
        unmount()
    })

    it('surfaces API failures', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockRejectedValue(new Error('offline'))
        const { result, queryClient, unmount } = withVueQuery(() => useDomainsQuery())

        await expect(queryClient.fetchQuery(result)).rejects.toThrow('offline')
        unmount()
    })
})
