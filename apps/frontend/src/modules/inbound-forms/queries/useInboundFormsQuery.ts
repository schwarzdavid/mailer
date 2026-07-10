import { queryOptions } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'

export function useInboundFormsQuery() {
    return queryOptions({
        queryKey: ['inboundForms'],
        queryFn: () => InboundFormApi.getInboundForms(),
    })
}
