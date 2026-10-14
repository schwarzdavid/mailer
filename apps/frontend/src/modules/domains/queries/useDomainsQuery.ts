import { queryOptions } from '@tanstack/vue-query'
import { DomainApi } from 'api'

export function useDomainsQuery() {
    return queryOptions({
        queryKey: ['domains'],
        queryFn: () => DomainApi.getDomains(),
    })
}
