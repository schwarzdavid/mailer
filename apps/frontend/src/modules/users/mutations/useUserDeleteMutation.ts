import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { UserApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUserDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (userId: number) => waitAtleast(UserApi.deleteUser({ path: { userId } })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
