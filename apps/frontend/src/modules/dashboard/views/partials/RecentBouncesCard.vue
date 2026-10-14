<template>
    <SectionCard :title="t('module.dashboard.bounces.title')" flush>
        <template #actions>
            <VBtn
                size="small"
                variant="text"
                :to="{ name: RouteNames.BOUNCE_LIST }"
                :text="t('module.dashboard.bounces.viewAll')"
            />
        </template>
        <ListSkeleton v-if="data.recentBounces.isPending.value" :rows="3" />
        <ErrorState
            v-else-if="data.recentBounces.isError.value"
            :thing="t('module.bounces.list.thing')"
            @retry="data.recentBounces.refetch()"
        />
        <EmptyState
            v-else-if="!bounces.length"
            tone="success"
            :icon="mdiCheckCircleOutline"
            :title="t('module.bounces.list.empty.title')"
            :text="t('module.bounces.list.empty.text')"
        />
        <ListRow v-for="bounce in bounces" :key="bounce.bounceId" :title="bounce.emailAddress" mono-title>
            <template #subtitle>
                <template v-if="bounce.statusCode"
                    ><span class="mono">{{ bounce.statusCode }}</span
                    ><span class="row-sep">·</span></template
                >
                <RelativeTime :value="bounce.receivedAt" />
            </template>
            <template #meta>
                <StatusBadge
                    :tone="bounce.type === 'permanent' ? 'error' : 'warning'"
                    :label="t(`status.${bounce.type}`)"
                />
            </template>
        </ListRow>
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { mdiCheckCircleOutline } from '@mdi/js'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import type { useDashboardData } from '@/modules/dashboard/composables/useDashboardData.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ data: ReturnType<typeof useDashboardData> }>()

    const { t } = useI18n()
    const bounces = computed(() => props.data.recentBounces.data.value?.items ?? [])
</script>
