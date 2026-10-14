import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import { useDomainsQuery } from '../useDomainsQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { useDomainQuery } from '../useDomainQuery.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const record: DomainDnsRecordDto = {
    current: null,
    host: 'mail.example.org',
    status: 'valid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const domains: DomainDto[] = [
    {
        domainId: 5,
        fqdn: 'mail.example.org',
        rootDomain: 'example.org',
        dns: { spf: record, dkim: record, dmarc: record },
        lastCheckedAt: null,
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useDomainsQuery', () => {
    it('loads every domain under the domains key', async () => {
        const getDomains = vi.spyOn(DomainApi, 'getDomains').mockResolvedValue(domains)
        const { result, queryClient, unmount } = withVueQuery(() => useDomainsQuery())

        expect(result.queryKey).toEqual(['domains'])
        await expect(queryClient.fetchQuery(result)).resolves.toEqual(domains)
        expect(getDomains).toHaveBeenCalledTimes(1)
        unmount()
    })

    it('seeds each domain under the key the detail query reads', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue(domains)
        const { result, queryClient, unmount } = withVueQuery(() => useDomainsQuery())

        await queryClient.fetchQuery(result)

        expect(queryClient.getQueryData(useDomainQuery(5).queryKey)).toEqual(domains[0])
        unmount()
    })

    it('surfaces API failures', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockRejectedValue(new Error('offline'))
        const { result, queryClient, unmount } = withVueQuery(() => useDomainsQuery())

        await expect(queryClient.fetchQuery(result)).rejects.toThrow('offline')
        unmount()
    })
})
