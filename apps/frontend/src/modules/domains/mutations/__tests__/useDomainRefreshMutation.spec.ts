import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import { useDomainRefreshMutation } from '../useDomainRefreshMutation.ts'
import { useDomainQuery } from '../../queries/useDomainQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const invalid: DomainDnsRecordDto = {
    current: null,
    host: 'mail.example.org',
    status: 'invalid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const valid: DomainDnsRecordDto = { ...invalid, status: 'valid', current: invalid.value }

const stale: DomainDto = {
    domainId: 5,
    fqdn: 'mail.example.org',
    rootDomain: 'example.org',
    dns: { spf: invalid, dkim: invalid, dmarc: invalid },
    lastCheckedAt: null,
}

const refreshed: DomainDto = {
    ...stale,
    dns: { spf: valid, dkim: valid, dmarc: valid },
    lastCheckedAt: new Date('2026-10-01T12:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useDomainRefreshMutation', () => {
    it('refreshes the records of the given domain', async () => {
        const refresh = vi.spyOn(DomainApi, 'refreshDomainRecords').mockResolvedValue(refreshed)
        const { result, unmount } = withVueQuery(() => useDomainRefreshMutation())

        await result.mutateAsync(5)

        expect(refresh).toHaveBeenCalledWith({ path: { domainId: 5 } })
        unmount()
    })

    it('replaces the cached domain the detail view reads', async () => {
        vi.spyOn(DomainApi, 'refreshDomainRecords').mockResolvedValue(refreshed)
        const { result, queryClient, unmount } = withVueQuery(() => useDomainRefreshMutation())
        queryClient.setQueryData(useDomainQuery(5).queryKey, stale)

        await result.mutateAsync(5)

        expect(queryClient.getQueryData(useDomainQuery(5).queryKey)).toEqual(refreshed)
        unmount()
    })
})
