import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useAbility } from '@casl/vue'
import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'

export function useSendingDomainHealth() {
    const userAbility = useAbility()
    const canRead = computed(() => userAbility.can('read', 'Settings'))

    const { queryKey, queryFn } = useSettingsQuery()
    const query = useQuery({
        queryKey,
        queryFn,
        refetchInterval: 60_000,
        enabled: canRead,
    })

    const records = computed(() => query.data.value?.sendingDomain?.records ?? [])
    const invalidCount = computed(() => records.value.filter((record) => record.status !== 'valid').length)
    const configured = computed(() => !!query.data.value?.sendingDomain)
    const needsAttention = computed(
        () => canRead.value && query.isSuccess.value && (!configured.value || invalidCount.value > 0),
    )

    return { query, canRead, records, invalidCount, configured, needsAttention }
}
