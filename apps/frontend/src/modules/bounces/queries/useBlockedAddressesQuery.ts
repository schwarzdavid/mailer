import { queryOptions } from '@tanstack/vue-query'
import { BounceApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useBlockedAddressesQuery() {
    return queryOptions({
        queryKey: ['bounces.blocked'],
        queryFn: () => waitAtleast(BounceApi.getBlockedAddresses()),
    })
}
