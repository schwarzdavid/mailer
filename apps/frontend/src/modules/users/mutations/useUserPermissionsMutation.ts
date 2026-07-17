import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { UserApi, type Permission, type UserDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useUserPermissionsMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ userId, permissions }: { userId: number; permissions: Permission[] }) =>
            waitAtleast(UserApi.replaceUserPermissions({ path: { userId }, body: { permissions } })),
        onSuccess(_, { userId }) {
            void client.invalidateQueries({ queryKey: ['users'] })
            const currentUser = client.getQueryData<UserDto>(['auth.user'])
            if (currentUser?.userId === userId) {
                void client.invalidateQueries({ queryKey: ['auth.ability'] })
            }
        },
    })
}
