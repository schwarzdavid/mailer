import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectMemberRemoveMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, userId }: { projectId: number; userId: number }) =>
            ProjectApi.removeProjectMember({ path: { projectId, userId } }),
        onSuccess(_, { projectId }) {
            void client.invalidateQueries({ queryKey: ['users'] })
            return client.invalidateQueries({ queryKey: ['projects', projectId, 'members'] })
        },
    })
}
