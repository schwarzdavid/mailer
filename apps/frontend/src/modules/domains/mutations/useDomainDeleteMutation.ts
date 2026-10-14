import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { DomainApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useDomainDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (domainId: number) => waitAtleast(DomainApi.deleteDomain({ path: { domainId } })),
        onSuccess(_data, domainId) {
            client.removeQueries({ queryKey: ['domains', domainId], exact: true })
            void client.invalidateQueries({ queryKey: ['domains'], exact: true })
            void client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
