import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectRestoreMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (projectId: number) => waitAtleast(ProjectApi.restoreProject({ path: { projectId } })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['projects'] })
            void client.invalidateQueries({ queryKey: ['projects.deleted'] })
        },
    })
}
