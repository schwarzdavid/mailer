import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { DomainApi, type DomainCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useDomainCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (domainCreate: DomainCreateDto) => waitAtleast(DomainApi.createDomain({ body: domainCreate })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['domains'], exact: true })
        },
    })
}
