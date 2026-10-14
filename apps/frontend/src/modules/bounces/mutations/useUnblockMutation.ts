import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { BounceApi } from 'api'

export function useUnblockMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (emailBlockId: number) => BounceApi.unblock({ path: { emailBlockId } }),
        onSuccess() {
            return client.invalidateQueries({ queryKey: ['bounces.blocked'] })
        },
    })
}
