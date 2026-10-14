import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import { useDomainDeleteMutation } from '../useDomainDeleteMutation.ts'
import { useDomainQuery } from '../../queries/useDomainQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const record: DomainDnsRecordDto = {
    current: null,
    host: 'mail.example.org',
    status: 'invalid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const domain: DomainDto = {
    domainId: 5,
    fqdn: 'mail.example.org',
    rootDomain: 'example.org',
    dns: { spf: record, dkim: record, dmarc: record },
    lastCheckedAt: null,
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useDomainDeleteMutation', () => {
    it('deletes the domain by id', async () => {
        const remove = vi.spyOn(DomainApi, 'deleteDomain').mockResolvedValue(undefined)
        const { result, unmount } = withVueQuery(() => useDomainDeleteMutation())

        await result.mutateAsync(5)

        expect(remove).toHaveBeenCalledWith({ path: { domainId: 5 } })
        unmount()
    })

    it('drops the cached detail and refreshes the domain and project lists', async () => {
        vi.spyOn(DomainApi, 'deleteDomain').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useDomainDeleteMutation())
        queryClient.setQueryData(useDomainQuery(5).queryKey, domain)
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync(5)

        expect(queryClient.getQueryData(useDomainQuery(5).queryKey)).toBeUndefined()
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['domains'], exact: true })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] })
        unmount()
    })

    it('keeps the cache untouched when deletion fails', async () => {
        vi.spyOn(DomainApi, 'deleteDomain').mockRejectedValue(new Error('Conflict'))
        const { result, queryClient, unmount } = withVueQuery(() => useDomainDeleteMutation())
        queryClient.setQueryData(useDomainQuery(5).queryKey, domain)
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync(5)).rejects.toThrow('Conflict')

        expect(queryClient.getQueryData(useDomainQuery(5).queryKey)).toEqual(domain)
        expect(invalidate).not.toHaveBeenCalled()
        unmount()
    })
})
