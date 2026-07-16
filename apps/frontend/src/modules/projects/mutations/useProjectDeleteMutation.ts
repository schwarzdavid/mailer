import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (projectId: number) => waitAtleast(ProjectApi.deleteProject({ path: { projectId } })),
        onSuccess(_result, projectId) {
            client.removeQueries({ queryKey: ['projects', projectId] })
            void client.invalidateQueries({ queryKey: ['projects'] })
            void client.invalidateQueries({ queryKey: ['projects.deleted'] })
        },
    })
}
