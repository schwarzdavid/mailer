import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { BounceApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUnblockMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (emailBlockId: number) => waitAtleast(BounceApi.unblock({ path: { emailBlockId } })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['bounces.blocked'] })
        },
    })
}
