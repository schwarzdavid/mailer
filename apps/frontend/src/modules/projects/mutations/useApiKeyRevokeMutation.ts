import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'

export function useApiKeyRevokeMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ projectId, apiKeyId }: { projectId: number; apiKeyId: number }) =>
            ApiKeyApi.revokeApiKey({ path: { projectId, apiKeyId } }),
        onSuccess(_, { projectId }) {
            return client.invalidateQueries({ queryKey: ['projects', projectId, 'apiKeys'] })
        },
    })
}
