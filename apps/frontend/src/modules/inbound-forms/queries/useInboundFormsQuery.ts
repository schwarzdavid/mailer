import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'

export function useInboundFormsQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId, 'inboundForms'],
        queryFn: () =>
            InboundFormApi.getInboundForms({
                query: {
                    projectId: toValue(projectId),
                },
            }),
    })
}
