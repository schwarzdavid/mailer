import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'

export function useApiKeysQuery(projectId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['projects', projectId, 'apiKeys'],
        queryFn: () =>
            ApiKeyApi.getApiKeys({
                path: {
                    projectId: toValue(projectId),
                },
            }),
    })
}
