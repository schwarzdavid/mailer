import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectImplicitAccessQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId, 'implicitAccess'],
        queryFn: () => ProjectApi.getProjectImplicitAccess({ path: { projectId: toValue(projectId) } }),
    })
}
