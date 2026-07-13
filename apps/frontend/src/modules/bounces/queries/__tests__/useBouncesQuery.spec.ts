import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type BounceDto } from 'api'
import { useQuery } from '@tanstack/vue-query'
import { useBouncesQuery } from '../useBouncesQuery.ts'
import { useBlockedAddressesQuery } from '../useBlockedAddressesQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

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
    it('loads the bounces and exposes them under the bounces key', async () => {
        const listSpy = vi.spyOn(BounceApi, 'getBounces').mockResolvedValue(bounces)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useBouncesQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledOnce()
        expect(result.data.value).toEqual(bounces)
        expect(queryClient.getQueryData(['bounces'])).toEqual(bounces)
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
