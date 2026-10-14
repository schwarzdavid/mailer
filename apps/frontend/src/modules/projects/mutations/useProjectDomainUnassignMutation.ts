import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectDomainUnassignMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, domainId }: { projectId: number; domainId: number }) =>
            ProjectApi.unassignProjectDomain({ path: { projectId, domainId } }),
        onSuccess() {
            return client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
