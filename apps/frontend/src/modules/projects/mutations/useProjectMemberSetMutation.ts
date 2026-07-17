import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ProjectApi, type ProjectPermission } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useProjectMemberSetMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            projectId,
            userId,
            permissions,
        }: {
            projectId: number
            userId: number
            permissions: ProjectPermission[]
        }) => waitAtleast(ProjectApi.setProjectMember({ path: { projectId, userId }, body: { permissions } })),
        onSuccess(_, { projectId }) {
            void client.invalidateQueries({ queryKey: ['projects', projectId, 'members'] })
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
