import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi, type ProjectCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (body: ProjectCreateDto) => waitAtleast(ProjectApi.createProject({ body })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
