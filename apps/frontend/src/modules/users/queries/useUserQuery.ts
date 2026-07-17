import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { UserApi } from 'api'

export function useUserQuery(userId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['users', userId],
        queryFn: () =>
            UserApi.getUser({
                path: {
                    userId: toValue(userId),
                },
            }),
    })
}
