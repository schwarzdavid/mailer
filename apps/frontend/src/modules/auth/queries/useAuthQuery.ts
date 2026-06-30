import { useQuery } from '@tanstack/vue-query'
import { AuthApi } from 'api'

export function useAuthQuery() {
    return useQuery({
        queryKey: ['auth.user'],
        queryFn: () => AuthApi.currentUser(),
    })
}
