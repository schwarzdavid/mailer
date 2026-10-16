import { type MaybeRefOrGetter, toValue } from 'vue'
import { queryOptions } from '@tanstack/vue-query'
import { RoleApi } from 'api'

export function useRoleQuery(roleId: MaybeRefOrGetter<number>) {
    return queryOptions({
        queryKey: ['roles', roleId],
        queryFn: () => RoleApi.getRole({ path: { roleId: toValue(roleId) } }),
    })
}
