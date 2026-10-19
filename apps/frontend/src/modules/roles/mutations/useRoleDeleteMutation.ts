import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RoleApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useRoleDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (roleId: number) => waitAtleast(RoleApi.deleteRole({ path: { roleId } })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['roles'], exact: true })
            void client.invalidateQueries({ queryKey: ['users'] })
        },
    })
}
