import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectMembersQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId, 'members'],
        queryFn: () =>
            ProjectApi.getProjectMembers({
                path: {
                    projectId: toValue(projectId),
                },
            }),
    })
}
