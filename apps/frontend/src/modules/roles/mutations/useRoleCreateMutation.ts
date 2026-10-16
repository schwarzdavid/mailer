import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { RoleApi, type RoleCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

const AFFECTED_KEYS = [['roles'], ['users'], ['auth.ability'], ['auth.permissions']]

export function useRoleCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (body: RoleCreateDto) => waitAtleast(RoleApi.createRole({ body })),
        onSuccess() {
            for (const queryKey of AFFECTED_KEYS) {
                void client.invalidateQueries({ queryKey })
            }
        },
    })
}
