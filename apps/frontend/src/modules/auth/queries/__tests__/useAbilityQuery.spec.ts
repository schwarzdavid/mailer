import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi } from 'api'
import { useQuery } from '@tanstack/vue-query'
import { useAbilityQuery } from '../useAbilityQuery.ts'
import { ability } from '@/plugins/casl.ts'
import { withVueQuery } from '@/__tests__/support.ts'

afterEach(() => {
    ability.update([])
    vi.restoreAllMocks()
})

describe('useAbilityQuery', () => {
    it('hydrates the ability singleton from the api rules', async () => {
        const rulesSpy = vi.spyOn(AuthApi, 'getAbility').mockResolvedValue([{ action: ['read'], subject: 'Domain' }])
        const { result, unmount } = withVueQuery(() => useQuery(useAbilityQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(rulesSpy).toHaveBeenCalledOnce()
        expect(ability.can('read', 'Domain')).toBe(true)
        expect(ability.can('create', 'Domain')).toBe(false)
        unmount()
    })
})
