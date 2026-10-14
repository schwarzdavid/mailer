<template>
    <SectionCard :title="t('module.dashboard.health.title')" flush>
        <template v-if="data.health.canRead.value && sendingDomain && canCheck" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiRefresh"
                :text="t('module.dashboard.health.check')"
                :loading="isPending"
                @click="check"
            />
        </template>
        <template v-if="data.health.canRead.value">
            <div class="health__label">{{ t('module.dashboard.health.sendingDomain') }}</div>
            <ListSkeleton v-if="data.health.query.isPending.value" :rows="1" />
            <ErrorState
                v-else-if="data.health.query.isError.value"
                :thing="t('module.dashboard.health.thing')"
                @retry="data.health.query.refetch()"
            />
            <RouterLink v-else-if="sendingDomain" :to="{ name: RouteNames.SETTINGS }" class="health__sending">
                <span class="health__sending-head">
                    <span class="mono">{{ sendingDomain.fqdn }}</span>
                    <StatusBadge v-bind="domainStatus.badge(sendingDomain.records)" />
                </span>
                <DnsMeter :records="sendingDomain.records" />
                <span v-if="sendingDomain.lastCheckedAt" class="health__checked">
                    <i18n-t keypath="dns.checkedAt" tag="span">
                        <template #time><RelativeTime :value="sendingDomain.lastCheckedAt" /></template>
                    </i18n-t>
                </span>
            </RouterLink>
            <ListRow
                v-else
                :icon="mdiAlertOutline"
                lead-tone="warning"
                :title="t('module.dashboard.attention.sendingMissing')"
                :to="{ name: RouteNames.SETTINGS }"
            />
        </template>
        <template v-if="data.canReadDomains.value">
            <div class="health__label">{{ t('module.dashboard.health.senderDomains') }}</div>
            <ListSkeleton v-if="data.domains.isPending.value" :rows="2" />
            <ErrorState
                v-else-if="data.domains.isError.value"
                :thing="t('module.domains.list.thing')"
                @retry="data.domains.refetch()"
            />
            <p v-else-if="!data.domains.data.value?.length" class="health__empty">
                {{ t('module.dashboard.health.noDomains') }}
            </p>
            <ListRow
                v-for="domain in data.domains.data.value ?? []"
                :key="domain.domainId"
                :title="domain.fqdn"
                mono-title
                :to="{ name: RouteNames.DOMAIN_DETAILS, params: { domainId: domain.domainId } }"
            >
                <template #meta>
                    <StatusBadge v-bind="domainStatus.domainBadge(domain)" />
                </template>
            </ListRow>
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { mdiAlertOutline, mdiRefresh } from '@mdi/js'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import DnsMeter from '@/components/dns/DnsMeter.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import type { useDashboardData } from '@/modules/dashboard/composables/useDashboardData.ts'
    import { useDomainStatus } from '@/modules/domains/helpers/domainStatus.ts'
    import { useSendingDomainRefreshMutation } from '@/modules/settings/mutations/useSendingDomainRefreshMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ data: ReturnType<typeof useDashboardData> }>()

    const { t } = useI18n()
    const notify = useNotify()
    const userAbility = useAbility()
    const domainStatus = useDomainStatus()
    const { mutateAsync, isPending } = useSendingDomainRefreshMutation()

    const sendingDomain = computed(() => props.data.health.query.data.value?.sendingDomain ?? null)
    const canCheck = computed(() => userAbility.can('update', 'Settings'))

    async function check() {
        try {
            await mutateAsync()
        } catch {
            notify.error(t('module.settings.records.checkFailed', { fqdn: sendingDomain.value?.fqdn ?? '' }), {
                retry: () => void check(),
            })
        }
    }
</script>

<style scoped>
    .health__label {
        padding: 8px 24px 4px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .health__sending {
        display: grid;
        gap: 8px;
        padding: 8px 24px 16px;
        color: rgb(var(--v-theme-ink));
        text-decoration: none;
    }

    .health__sending:hover {
        background: rgb(var(--v-theme-surface-hover));
    }

    .health__sending-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .health__checked,
    .health__empty {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .health__empty {
        margin: 0;
        padding: 4px 24px 12px;
    }
</style>
