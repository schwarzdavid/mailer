<template>
    <PageHeader :title="t('module.bounces.title')" :description="t('module.bounces.description')">
        <template #tabs>
            <VTabs class="bounce-tabs" color="ink" :model-value="route.name" density="comfortable">
                <VTab :value="RouteNames.BOUNCE_LIST" :to="{ name: RouteNames.BOUNCE_LIST }">
                    {{ t('module.bounces.tabs.bounces') }}
                    <CountPill v-if="bounceTotal !== undefined" class="ms-2" :value="bounceTotal" />
                </VTab>
                <VTab :value="RouteNames.BOUNCE_BLOCKED" :to="{ name: RouteNames.BOUNCE_BLOCKED }">
                    {{ t('module.bounces.tabs.blocked') }}
                    <CountPill v-if="blocked" class="ms-2" :value="blocked.length" />
                </VTab>
            </VTabs>
        </template>
    </PageHeader>
    <VWindow :model-value="route.name" :touch="false">
        <VWindowItem :value="RouteNames.BOUNCE_LIST">
            <BounceTable />
        </VWindowItem>
        <VWindowItem :value="RouteNames.BOUNCE_BLOCKED">
            <BlockedTable />
        </VWindowItem>
    </VWindow>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useRoute } from 'vue-router'
    import CountPill from '@/components/CountPill.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import { useBlockedAddressesQuery } from '@/modules/bounces/queries/useBlockedAddressesQuery.ts'
    import { useBouncesQuery } from '@/modules/bounces/queries/useBouncesQuery.ts'
    import BlockedTable from '@/modules/bounces/views/list/partials/BlockedTable.vue'
    import BounceTable from '@/modules/bounces/views/list/partials/BounceTable.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const route = useRoute()
    const { data: totals } = useQuery(useBouncesQuery({ page: 1, itemsPerPage: 1 }))
    const { data: blocked } = useQuery(useBlockedAddressesQuery())

    const bounceTotal = computed(() => totals.value?.total)
</script>

<style scoped>
    .bounce-tabs {
        margin-top: 8px;
        border-bottom: 1px solid rgb(var(--v-theme-border));
    }

    .bounce-tabs :deep(.v-tab) {
        letter-spacing: normal;
        text-transform: none;
    }
</style>
