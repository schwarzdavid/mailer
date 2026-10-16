import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RoleApi, type RoleUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useRoleUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ roleId, body }: { roleId: number; body: RoleUpdateDto }) =>
            waitAtleast(RoleApi.updateRole({ path: { roleId }, body })),
        onSuccess(role, { roleId }) {
            client.setQueryData(['roles', roleId], role)
            for (const queryKey of [['roles'], ['users'], ['auth.ability'], ['auth.permissions']]) {
                void client.invalidateQueries({ queryKey })
            }
        },
    })
}
