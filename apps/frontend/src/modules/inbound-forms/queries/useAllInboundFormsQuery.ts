import { queryOptions } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'

export function useAllInboundFormsQuery() {
    return queryOptions({
        queryKey: ['inboundForms'],
        queryFn: () => InboundFormApi.getInboundForms(),
    })
}
