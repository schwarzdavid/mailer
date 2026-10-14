import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type BounceDto, type BouncePageDto } from 'api'
import { useQuery } from '@tanstack/vue-query'
import { useBouncesQuery } from '../useBouncesQuery.ts'
import { useBlockedAddressesQuery } from '../useBlockedAddressesQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const bounces: BounceDto[] = [
    {
        bounceId: 1,
        emailAddress: 'missing@example.org',
        type: 'permanent',
        statusCode: '5.1.1',
        reason: 'User unknown',
        receivedAt: new Date('2026-07-13T10:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useBouncesQuery', () => {
    it('loads one page of bounces with the given filters', async () => {
        const page: BouncePageDto = { items: bounces, total: 1 }
        const listSpy = vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(page)
        const query = { page: 2, itemsPerPage: 25, type: 'permanent' as const }
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useBouncesQuery(query)))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledWith({ query })
        expect(result.data.value).toEqual(page)
        expect(queryClient.getQueryData(['bounces', query])).toEqual(page)
        unmount()
    })
})

describe('useBlockedAddressesQuery', () => {
    it('loads the blocked addresses under the bounces.blocked key', async () => {
        const listSpy = vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue([])
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useBlockedAddressesQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledOnce()
        expect(queryClient.getQueryData(['bounces.blocked'])).toEqual([])
        unmount()
    })
})
