import { type MaybeRefOrGetter, toValue } from 'vue'
import { keepPreviousData, queryOptions } from '@tanstack/vue-query'
import { BounceApi, type GetBouncesData } from 'api'

export type BounceQuery = NonNullable<GetBouncesData['query']>

export function useBouncesQuery(query: MaybeRefOrGetter<BounceQuery> = {}) {
    return queryOptions({
        queryKey: ['bounces', query],
        queryFn: () => BounceApi.getBounces({ query: toValue(query) }),
        placeholderData: keepPreviousData,
    })
}
