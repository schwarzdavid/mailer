import { queryOptions } from '@tanstack/vue-query'
import { AuthApi } from 'api'

export function useAuthQuery() {
    return queryOptions({
        queryKey: ['auth.user'],
        queryFn: () => AuthApi.currentUser(),
    })
}
