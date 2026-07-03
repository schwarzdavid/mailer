import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { DomainApi } from 'api'

export function useDomainQuery(domainId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['domains', domainId],
        queryFn: () =>
            DomainApi.getDomain({
                path: {
                    domainId: toValue(domainId).toString(),
                },
            }),
    })
}
