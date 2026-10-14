import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import { useDomainCreateMutation } from '../useDomainCreateMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { useDomainQuery } from '@/modules/domains/queries/useDomainQuery.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const record: DomainDnsRecordDto = {
    current: null,
    host: 'example.org',
    status: 'invalid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

function buildDomain(domainId: number, fqdn: string): DomainDto {
    return {
        domainId,
        fqdn,
        rootDomain: 'example.org',
        dns: { spf: record, dkim: record, dmarc: record },
        lastCheckedAt: null,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useDomainCreateMutation', () => {
    it('creates the domain with the entered fqdn', async () => {
        const created = buildDomain(6, 'news.example.org')
        const create = vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(created)
        const { result, unmount } = withVueQuery(() => useDomainCreateMutation())

        await expect(result.mutateAsync({ fqdn: 'news.example.org' })).resolves.toEqual(created)

        expect(create).toHaveBeenCalledWith({ body: { fqdn: 'news.example.org' } })
        unmount()
    })

    it('appends the new domain to a cached domain list', async () => {
        const existing = buildDomain(5, 'mail.example.org')
        const created = buildDomain(6, 'news.example.org')
        vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(created)
        const { result, queryClient, unmount } = withVueQuery(() => useDomainCreateMutation())
        queryClient.setQueryData<DomainDto[]>(['domains'], [existing])

        await result.mutateAsync({ fqdn: 'news.example.org' })

        expect(queryClient.getQueryData(['domains'])).toEqual([existing, created])
        unmount()
    })

    it('replaces the cached list instead of mutating it', async () => {
        const existing = buildDomain(5, 'mail.example.org')
        const cached: DomainDto[] = [existing]
        vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(buildDomain(6, 'news.example.org'))
        const { result, queryClient, unmount } = withVueQuery(() => useDomainCreateMutation())
        queryClient.setQueryData<DomainDto[]>(['domains'], cached)

        await result.mutateAsync({ fqdn: 'news.example.org' })

        expect(queryClient.getQueryData(['domains'])).not.toBe(cached)
        expect(cached).toEqual([existing])
        unmount()
    })

    it('seeds the detail cache under the key the detail query reads', async () => {
        const created = buildDomain(6, 'news.example.org')
        vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(created)
        const { result, queryClient, unmount } = withVueQuery(() => useDomainCreateMutation())

        await result.mutateAsync({ fqdn: 'news.example.org' })

        expect(queryClient.getQueryData(useDomainQuery(6).queryKey)).toEqual(created)
        unmount()
    })

    it('does not seed a domain list that was never loaded', async () => {
        vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(buildDomain(6, 'news.example.org'))
        const { result, queryClient, unmount } = withVueQuery(() => useDomainCreateMutation())

        await result.mutateAsync({ fqdn: 'news.example.org' })

        expect(queryClient.getQueryData(['domains'])).toBeUndefined()
        unmount()
    })

    it('rejects and keeps the cached list untouched when the API fails', async () => {
        const existing = buildDomain(5, 'mail.example.org')
        vi.spyOn(DomainApi, 'createDomain').mockRejectedValue(new Error('Domain already exists'))
        const { result, queryClient, unmount } = withVueQuery(() => useDomainCreateMutation())
        queryClient.setQueryData<DomainDto[]>(['domains'], [existing])

        await expect(result.mutateAsync({ fqdn: 'mail.example.org' })).rejects.toThrow('Domain already exists')

        expect(queryClient.getQueryData(['domains'])).toEqual([existing])
        unmount()
    })
})
