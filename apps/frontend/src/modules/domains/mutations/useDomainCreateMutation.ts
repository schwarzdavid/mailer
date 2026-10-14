import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { DomainApi, type DomainCreateDto, type DomainDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useDomainCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (domainCreate: DomainCreateDto) =>
            waitAtleast(
                DomainApi.createDomain({
                    body: domainCreate,
                }),
            ),
        onSuccess(domain) {
            client.setQueryData(['domains', domain.domainId], domain)
            client.setQueryData<DomainDto[]>(['domains'], (domains) => (domains ? [...domains, domain] : domains))
        },
    })
}
