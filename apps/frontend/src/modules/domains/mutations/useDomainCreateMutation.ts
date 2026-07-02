import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { DomainApi, type DomainCreateDto } from 'api'

export function useDomainCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (domainCreate: DomainCreateDto) => DomainApi.createDomain({
            body: domainCreate
        }),
        onSuccess(domain) {
            client.setQueryData(['domain', domain.domainId], domain)
        }
    })
}
