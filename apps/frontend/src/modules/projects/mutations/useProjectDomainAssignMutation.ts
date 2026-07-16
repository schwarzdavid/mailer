import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectDomainAssignMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, domainId }: { projectId: number; domainId: number }) =>
            waitAtleast(ProjectApi.assignProjectDomain({ path: { projectId }, body: { domainId } })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
