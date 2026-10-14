import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { DomainApi, type DomainDetailDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useDomainRefreshMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (domainId: number) => waitAtleast(DomainApi.refreshDomainRecords({ path: { domainId } })),
        onSuccess(data) {
            client.setQueryData<DomainDetailDto>(['domains', data.domainId], (detail) =>
                detail ? { ...detail, ...data } : detail,
            )
            void client.invalidateQueries({ queryKey: ['domains'], exact: true })
            void client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
