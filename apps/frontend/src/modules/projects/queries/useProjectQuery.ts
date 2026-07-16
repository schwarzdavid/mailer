import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId],
        queryFn: () =>
            ProjectApi.getProject({
                path: {
                    projectId: toValue(projectId),
                },
            }),
    })
}
