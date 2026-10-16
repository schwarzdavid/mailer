import { queryOptions } from '@tanstack/vue-query'
import { AuthApi } from 'api'

export function useAuthPermissionsQuery() {
    return queryOptions({
        queryKey: ['auth.permissions'],
        staleTime: 60_000,
        queryFn: () => AuthApi.getHeldPermissions(),
    })
}
