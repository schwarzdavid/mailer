import { queryOptions } from '@tanstack/vue-query'
import { UserApi } from 'api'

export function useUsersQuery() {
    return queryOptions({
        queryKey: ['users'],
        queryFn: () => UserApi.getUsers(),
    })
}
