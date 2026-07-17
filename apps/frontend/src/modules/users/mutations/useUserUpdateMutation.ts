import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { UserApi, type UserDto, type UserUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUserUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ userId, body }: { userId: number; body: UserUpdateDto }) =>
            waitAtleast(UserApi.updateUser({ path: { userId }, body })),
        onSuccess(_, { userId }) {
            void client.invalidateQueries({ queryKey: ['users'] })
            const currentUser = client.getQueryData<UserDto>(['auth.user'])
            if (currentUser?.userId === userId) {
                void client.invalidateQueries({ queryKey: ['auth.user'] })
                void client.invalidateQueries({ queryKey: ['auth.ability'] })
            }
        },
    })
}
