<template>
    <VCard class="bounce-table">
        <div class="table-toolbar">
            <VTextField
                v-model="search"
                class="table-toolbar__search"
                name="search"
                density="compact"
                :prepend-inner-icon="mdiMagnify"
                :label="t('module.bounces.list.search')"
                clearable
            />
            <VChipGroup v-model="type" mandatory selected-class="filter-chip--selected" class="table-toolbar__filters">
                <VChip
                    v-for="option in typeOptions"
                    :key="option.value"
                    :value="option.value"
                    class="filter-chip"
                    label
                    filter
                >
                    {{ option.title }}
                </VChip>
            </VChipGroup>
            <span v-if="data" class="table-toolbar__count">
                {{ t('module.bounces.list.count', { count: data.total }, data.total) }}
            </span>
        </div>
        <ErrorState
            v-if="isError"
            :thing="t('module.bounces.list.thing')"
            :error="error"
            :retrying="isFetching"
            @retry="refetch()"
        />
        <TableSkeleton v-else-if="isPending" :columns="5" :label="t('module.bounces.list.loading')" />
        <template v-else>
            <VDataTableServer
                v-model:page="page"
                v-model:sort-by="sortBy"
                :headers="headers"
                :items="data?.items ?? []"
                :items-length="data?.total ?? 0"
                :items-per-page="itemsPerPage"
                :loading="isFetching"
                :mobile="xs"
                item-value="bounceId"
                must-sort
                hide-default-footer
                class="bounce-table__table"
            >
                <template #loader>
                    <VProgressLinear indeterminate color="ink" height="2" />
                </template>
                <template #[`item.emailAddress`]="{ item }">
                    <span class="mono">{{ item.emailAddress }}</span>
                </template>
                <template #[`item.type`]="{ item }">
                    <StatusBadge
                        :tone="item.type === 'permanent' ? 'error' : 'warning'"
                        :label="t(`status.${item.type}`)"
                    />
                </template>
                <template #[`item.statusCode`]="{ item }">
                    <span class="mono">{{ item.statusCode ?? '—' }}</span>
                </template>
                <template #[`item.receivedAt`]="{ item }">
                    <RelativeTime :value="item.receivedAt" />
                </template>
                <template #no-data>
                    <EmptyState
                        v-if="filtered"
                        :icon="mdiMagnify"
                        :title="
                            search
                                ? t('module.bounces.list.noMatch.title', { search })
                                : t('module.bounces.list.noMatch.titleType')
                        "
                        :text="t('module.bounces.list.noMatch.text')"
                    >
                        <template #actions>
                            <VBtn :text="t('module.bounces.list.noMatch.clear')" @click="clearFilters" />
                        </template>
                    </EmptyState>
                    <EmptyState
                        v-else
                        tone="success"
                        :icon="mdiCheckCircleOutline"
                        :title="t('module.bounces.list.empty.title')"
                        :text="t('module.bounces.list.empty.text')"
                    />
                </template>
            </VDataTableServer>
            <TablePagerFooter v-model:page="page" :range="range" />
        </template>
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import { mdiCheckCircleOutline, mdiMagnify } from '@mdi/js'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import TablePagerFooter from '@/components/TablePagerFooter.vue'
    import TableSkeleton from '@/components/skeletons/TableSkeleton.vue'
    import { usePagedServerTable } from '@/composables/usePagedServerTable.ts'
    import { useBouncesQuery, type BounceQuery } from '@/modules/bounces/queries/useBouncesQuery.ts'

    const { t } = useI18n()
    const { xs } = useDisplay()
    const type = ref<'all' | 'permanent' | 'transient'>('all')
    const sortBy = ref<{ key: string; order?: boolean | 'asc' | 'desc' }[]>([{ key: 'receivedAt', order: 'desc' }])
    const { search, debouncedSearch, page, itemsPerPage, range, clearFilters } = usePagedServerTable({
        total: () => data.value?.total,
        resetPageOn: [type, sortBy],
        resetFilters: () => {
            type.value = 'all'
        },
    })

    const query = computed<BounceQuery>(() => {
        const sort = sortBy.value[0]
        return {
            page: page.value,
            itemsPerPage,
            search: debouncedSearch.value?.trim() || undefined,
            type: type.value === 'all' ? undefined : type.value,
            sortBy: sort?.key === 'type' ? 'type' : 'receivedAt',
            sortOrder: sort?.order === 'asc' ? 'asc' : 'desc',
        }
    })

    const { data, isPending, isFetching, isError, error, refetch } = useQuery(useBouncesQuery(query))

    const filtered = computed(() => !!query.value.search || !!query.value.type)

    const typeOptions = computed(() => [
        { value: 'all', title: t('module.bounces.list.types.all') },
        { value: 'permanent', title: t('status.permanent') },
        { value: 'transient', title: t('status.transient') },
    ])

    const headers = computed(() => [
        { key: 'emailAddress', title: t('module.bounces.list.columns.recipient'), sortable: false },
        { key: 'type', title: t('module.bounces.list.columns.type'), sortable: true },
        { key: 'statusCode', title: t('module.bounces.list.columns.status'), sortable: false },
        { key: 'reason', title: t('module.bounces.list.columns.reason'), sortable: false },
        { key: 'receivedAt', title: t('module.bounces.list.columns.received'), sortable: true, nowrap: true },
    ])
</script>

<style scoped>
    .bounce-table {
        background: rgb(var(--v-theme-surface));
    }
</style>
