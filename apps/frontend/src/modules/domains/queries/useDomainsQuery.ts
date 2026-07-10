import { queryOptions, useQueryClient } from '@tanstack/vue-query'
import { DomainApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useDomainsQuery() {
    const queryClient = useQueryClient()

    return queryOptions({
        queryKey: ['domains'],
        queryFn: () =>
            waitAtleast(DomainApi.getDomains()).then((domains) => {
                domains.forEach((domain) => queryClient.setQueryData(['domain', domain.domainId], domain))
                return domains
            }),
    })
}
