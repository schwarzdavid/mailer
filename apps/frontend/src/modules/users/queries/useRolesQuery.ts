import { queryOptions } from '@tanstack/vue-query'
import { RoleApi } from 'api'

export function useRolesQuery() {
    return queryOptions({
        queryKey: ['roles'],
        queryFn: () => RoleApi.getRoles(),
    })
}
