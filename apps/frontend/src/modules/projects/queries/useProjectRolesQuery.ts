import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectRolesQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId, 'roles'],
        queryFn: () => ProjectApi.getProjectRoles({ path: { projectId: toValue(projectId) } }),
    })
}
