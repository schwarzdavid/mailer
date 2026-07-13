import { queryOptions } from '@tanstack/vue-query'
import { BounceApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useBouncesQuery() {
    return queryOptions({
        queryKey: ['bounces'],
        queryFn: () => waitAtleast(BounceApi.getBounces()),
    })
}
