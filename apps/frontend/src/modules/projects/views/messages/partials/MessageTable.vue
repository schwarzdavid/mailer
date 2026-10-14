<template>
    <VCard class="message-table">
        <div class="table-toolbar">
            <VTextField
                v-model="search"
                class="table-toolbar__search"
                name="search"
                density="compact"
                :prepend-inner-icon="mdiMagnify"
                :label="t('module.projects.messages.search')"
                clearable
            />
            <VChipGroup
                v-model="source"
                mandatory
                selected-class="filter-chip--selected"
                class="table-toolbar__filters"
            >
                <VChip
                    v-for="option in sourceOptions"
                    :key="option.value"
                    :value="option.value"
                    class="filter-chip"
                    label
                    filter
                >
                    {{ option.title }}
                </VChip>
            </VChipGroup>
            <VChipGroup
                v-model="status"
                mandatory
                selected-class="filter-chip--selected"
                class="table-toolbar__filters"
            >
                <VChip
                    v-for="option in statusOptions"
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
                {{ t('module.projects.messages.count', { count: data.total }, data.total) }}
            </span>
        </div>
        <ErrorState
            v-if="isError"
            :kind="notFound ? 'notFound' : 'load'"
            :thing="notFound ? t('module.projects.details.thing') : t('module.projects.messages.thing')"
            :error="error"
            @retry="refetch()"
        />
        <TableSkeleton v-else-if="isPending" :columns="5" :label="t('module.projects.messages.loading')" />
        <template v-else>
            <VDataTableServer
                v-model:page="page"
                :headers="headers"
                :items="data?.items ?? []"
                :items-length="data?.total ?? 0"
                :items-per-page="ITEMS_PER_PAGE"
                :loading="isFetching"
                :mobile="xs"
                item-value="mailMessageId"
                hide-default-footer
                class="message-table__table"
            >
                <template #loader>
                    <VProgressLinear indeterminate color="ink" height="2" />
                </template>
                <template #[`item.emailTo`]="{ item }">
                    <span class="mono">{{ item.emailTo }}</span>
                </template>
                <template #[`item.subject`]="{ item }">
                    <span>{{ item.subject }}</span>
                    <span v-if="item.error" class="message-table__error">{{ item.error }}</span>
                </template>
                <template #[`item.source`]="{ item }">
                    <TagLabel :label="t(`module.projects.messages.sourceTag.${item.source}`)" />
                </template>
                <template #[`item.status`]="{ item }">
                    <StatusBadge
                        :tone="STATUS_TONES[item.status]"
                        :label="t(`module.projects.messages.statuses.${item.status}`)"
                    />
                </template>
                <template #[`item.createdAt`]="{ item }">
                    <RelativeTime :value="item.sentAt ?? item.createdAt" />
                </template>
                <template #no-data>
                    <EmptyState
                        v-if="filtered"
                        :icon="mdiMagnify"
                        :title="
                            query.search
                                ? t('module.projects.messages.noMatch.title', { search: query.search })
                                : t('module.projects.messages.noMatch.titleFilter')
                        "
                        :text="t('module.projects.messages.noMatch.text')"
                    >
                        <template #actions>
                            <VBtn :text="t('module.projects.messages.noMatch.clear')" @click="clearFilters" />
                        </template>
                    </EmptyState>
                    <EmptyState
                        v-else
                        :icon="mdiEmailOutline"
                        :title="t('module.projects.messages.empty.title')"
                        :text="t('module.projects.messages.empty.text')"
                    />
                </template>
            </VDataTableServer>
            <div v-if="data && data.total > 0" class="table-footer">
                <span class="tabular-nums">{{ t('module.projects.messages.range', range) }}</span>
                <IconButton
                    :icon="mdiChevronLeft"
                    :label="t('module.projects.messages.previous')"
                    small
                    :disabled="page <= 1"
                    @click="page--"
                />
                <IconButton
                    :icon="mdiChevronRight"
                    :label="t('module.projects.messages.next')"
                    small
                    :disabled="range.to >= data.total"
                    @click="page++"
                />
            </div>
        </template>
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import { refDebounced } from '@vueuse/core'
    import { mdiChevronLeft, mdiChevronRight, mdiEmailOutline, mdiMagnify } from '@mdi/js'
    import type { MailMessageDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import IconButton from '@/components/IconButton.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import TableSkeleton from '@/components/skeletons/TableSkeleton.vue'
    import type { StatusTone } from '@/components/statusTone.ts'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import {
        useProjectMessagesQuery,
        type ProjectMessageQuery,
    } from '@/modules/projects/queries/useProjectMessagesQuery.ts'

    const ITEMS_PER_PAGE = 25

    const STATUS_TONES: Record<MailMessageDto['status'], StatusTone> = {
        sent: 'success',
        failed: 'error',
        blocked: 'warning',
        pending: 'pending',
    }

    const props = defineProps<{ projectId: number }>()

    const { t, n } = useI18n()
    const { xs } = useDisplay()
    const search = ref<string | null>('')
    const debouncedSearch = refDebounced(search, 300)
    const source = ref<'all' | MailMessageDto['source']>('all')
    const status = ref<'all' | Exclude<MailMessageDto['status'], 'pending'>>('all')
    const page = ref(1)

    const query = computed<ProjectMessageQuery>(() => ({
        page: page.value,
        itemsPerPage: ITEMS_PER_PAGE,
        search: debouncedSearch.value?.trim() || undefined,
        source: source.value === 'all' ? undefined : source.value,
        status: status.value === 'all' ? undefined : status.value,
    }))

    const { data, isPending, isFetching, isError, error, refetch } = useQuery(
        useProjectMessagesQuery(() => props.projectId, query),
    )

    const notFound = computed(() => apiErrorStatus(error.value) === 404)
    const filtered = computed(() => !!query.value.search || !!query.value.source || !!query.value.status)

    const sourceOptions = computed(() => [
        { value: 'all', title: t('module.projects.messages.sources.all') },
        { value: 'api', title: t('module.projects.messages.sources.api') },
        { value: 'inbound_form', title: t('module.projects.messages.sources.inbound_form') },
    ])

    const statusOptions = computed(() => [
        { value: 'all', title: t('module.projects.messages.statuses.all') },
        { value: 'sent', title: t('module.projects.messages.statuses.sent') },
        { value: 'failed', title: t('module.projects.messages.statuses.failed') },
        { value: 'blocked', title: t('module.projects.messages.statuses.blocked') },
    ])

    const headers = computed(() => [
        { key: 'emailTo', title: t('module.projects.messages.columns.recipient'), sortable: false },
        { key: 'subject', title: t('module.projects.messages.columns.subject'), sortable: false },
        { key: 'source', title: t('module.projects.messages.columns.source'), sortable: false },
        { key: 'status', title: t('module.projects.messages.columns.status'), sortable: false },
        { key: 'createdAt', title: t('module.projects.messages.columns.sent'), sortable: false, nowrap: true },
    ])

    const range = computed(() => {
        const total = data.value?.total ?? 0
        const from = total === 0 ? 0 : (page.value - 1) * ITEMS_PER_PAGE + 1
        const to = Math.min(page.value * ITEMS_PER_PAGE, total)
        return { from: n(from), to, total: n(total) }
    })

    watch([debouncedSearch, source, status], () => {
        page.value = 1
    })

    function clearFilters() {
        search.value = ''
        source.value = 'all'
        status.value = 'all'
    }
</script>

<style scoped>
    .message-table {
        background: rgb(var(--v-theme-surface));
    }

    .message-table__error {
        display: block;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
    }
</style>
