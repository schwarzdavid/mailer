import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi, type ProjectUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, update }: { projectId: number; update: ProjectUpdateDto }) =>
            waitAtleast(ProjectApi.updateProject({ path: { projectId }, body: update })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
