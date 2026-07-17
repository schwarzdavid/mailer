import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { UserApi, type UserCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUserCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (body: UserCreateDto) => waitAtleast(UserApi.createUser({ body })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
