import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'

export function useInboundFormTemplatesQuery(
    inboundFormId: MaybeRefOrGetter<number>,
    inboundFormReceiverId: MaybeRefOrGetter<number>,
) {
    return queryOptions({
        queryKey: ['inboundForms', inboundFormId, 'templates', inboundFormReceiverId],
        queryFn: () =>
            InboundFormApi.getInboundFormTemplates({
                path: {
                    inboundFormId: toValue(inboundFormId),
                    inboundFormReceiverId: toValue(inboundFormReceiverId),
                },
            }),
    })
}
