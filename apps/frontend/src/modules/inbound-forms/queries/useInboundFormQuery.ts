import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'

export function useInboundFormQuery(inboundFormId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['inboundForms', inboundFormId],
        queryFn: () =>
            InboundFormApi.getInboundForm({
                path: {
                    inboundFormId: toValue(inboundFormId),
                },
            }),
    })
}
