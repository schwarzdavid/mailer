import { queryOptions } from '@tanstack/vue-query'
import { AuthApi } from 'api'
import type { RawRuleOf } from '@casl/ability'
import { ability, type AppAbility } from '@/plugins/casl.ts'

export function useAbilityQuery() {
    return queryOptions({
        queryKey: ['auth.ability'],
        staleTime: 60_000,
        async queryFn() {
            const rules = await AuthApi.getAbility()
            ability.update(rules as RawRuleOf<AppAbility>[])
            return rules
        },
    })
}
