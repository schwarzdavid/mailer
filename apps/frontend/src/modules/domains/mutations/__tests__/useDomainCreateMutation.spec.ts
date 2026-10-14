import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi } from 'api'
import { useDomainCreateMutation } from '../useDomainCreateMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { domain } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useDomainCreateMutation', () => {
    it('creates the domain with the entered fqdn', async () => {
        const created = domain({ domainId: 6, fqdn: 'news.example.org' })
        const create = vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(created)
        const { result, unmount } = withVueQuery(() => useDomainCreateMutation())

        await expect(result.mutateAsync({ fqdn: 'news.example.org' })).resolves.toEqual(created)

        expect(create).toHaveBeenCalledWith({ body: { fqdn: 'news.example.org' } })
        unmount()
    })

    it('refreshes the domain list', async () => {
        vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(domain({ domainId: 6 }))
        const { result, queryClient, unmount } = withVueQuery(() => useDomainCreateMutation())
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ fqdn: 'news.example.org' })

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['domains'], exact: true })
        unmount()
    })

    it('rejects without refreshing when the API fails', async () => {
        vi.spyOn(DomainApi, 'createDomain').mockRejectedValue(new Error('Domain already exists'))
        const { result, queryClient, unmount } = withVueQuery(() => useDomainCreateMutation())
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ fqdn: 'mail.example.org' })).rejects.toThrow('Domain already exists')

        expect(invalidate).not.toHaveBeenCalled()
        unmount()
    })
})
