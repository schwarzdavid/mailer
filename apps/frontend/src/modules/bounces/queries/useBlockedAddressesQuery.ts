import { queryOptions } from '@tanstack/vue-query'
import { BounceApi } from 'api'

export function useBlockedAddressesQuery() {
    return queryOptions({
        queryKey: ['bounces.blocked'],
        queryFn: () => BounceApi.getBlockedAddresses(),
    })
}
