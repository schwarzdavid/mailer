import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { DomainApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useDomainRefreshMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (domainId: number) =>
            waitAtleast(
                DomainApi.refreshDomainRecords({
                    path: { domainId },
                }),
                2000,
            ),
        onSuccess(data) {
            client.setQueryData(['domains', data.domainId], data)
        },
    })
}
