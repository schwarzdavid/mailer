import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectMemberRemoveMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, userId }: { projectId: number; userId: number }) =>
            waitAtleast(ProjectApi.removeProjectMember({ path: { projectId, userId } })),
        onSuccess(_, { projectId }) {
            void client.invalidateQueries({ queryKey: ['projects', projectId, 'members'] })
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
