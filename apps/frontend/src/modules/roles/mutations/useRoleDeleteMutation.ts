import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RoleApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useRoleDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (roleId: number) => waitAtleast(RoleApi.deleteRole({ path: { roleId } })),
        onSuccess(_, roleId) {
            client.removeQueries({ queryKey: ['roles', roleId] })
            void client.invalidateQueries({ queryKey: ['roles'] })
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
