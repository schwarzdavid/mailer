import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useApiKeyCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        gcTime: 0,
        mutationFn: ({ projectId, name }: { projectId: number; name: string }) =>
            waitAtleast(ApiKeyApi.createApiKey({ path: { projectId }, body: { name } })),
        onSuccess(_, { projectId }) {
            return client.invalidateQueries({ queryKey: ['projects', projectId, 'apiKeys'] })
        },
    })
}
