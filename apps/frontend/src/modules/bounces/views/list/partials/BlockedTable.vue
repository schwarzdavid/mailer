<template>
    <VCard class="blocked-table">
        <div v-if="visible.length" class="table-toolbar">
            <span class="table-toolbar__count">
                {{ t('module.bounces.blocked.count', { count: visible.length }, visible.length) }}
            </span>
        </div>
        <ErrorState v-if="isError" :thing="t('module.bounces.blocked.thing')" :error="error" @retry="refetch()" />
        <TableSkeleton v-else-if="isPending" :columns="4" :label="t('module.bounces.blocked.loading')" />
        <VDataTable
            v-else
            :headers="headers"
            :items="visible"
            :items-per-page="-1"
            :loading="isFetching"
            :mobile="xs"
            item-value="emailBlockId"
            hide-default-footer
        >
            <template #loader>
                <VProgressLinear indeterminate color="ink" height="2" />
            </template>
            <template #[`item.emailAddress`]="{ item }">
                <span class="mono">{{ item.emailAddress }}</span>
            </template>
            <template #[`item.blockedUntil`]="{ item }">
                {{ item.blockedUntil ? dates.day(item.blockedUntil) : t('module.bounces.blocked.indefinitely') }}
            </template>
            <template #[`item.blockCount`]="{ item }">
                <span class="tabular-nums">{{ n(item.blockCount) }}</span>
            </template>
            <template #[`item.actions`]="{ item }">
                <VBtn
                    size="small"
                    :text="t('module.bounces.blocked.unblock')"
                    :aria-label="t('module.bounces.blocked.unblockLabel', { email: item.emailAddress })"
                    @click="unblock(item)"
                />
            </template>
            <template #no-data>
                <EmptyState
                    tone="success"
                    :icon="mdiCheckCircleOutline"
                    :title="t('module.bounces.blocked.empty.title')"
                    :text="t('module.bounces.blocked.empty.text')"
                />
            </template>
        </VDataTable>
    </VCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import { useAbility } from '@casl/vue'
    import { mdiCheckCircleOutline } from '@mdi/js'
    import type { EmailBlockDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import TableSkeleton from '@/components/skeletons/TableSkeleton.vue'
    import { useDates } from '@/composables/useDates.ts'
    import { useUndoRemove } from '@/composables/useUndoRemove.ts'
    import { useBlockedAddressesQuery } from '@/modules/bounces/queries/useBlockedAddressesQuery.ts'
    import { useUnblockMutation } from '@/modules/bounces/mutations/useUnblockMutation.ts'

    const { t, n } = useI18n()
    const { xs } = useDisplay()
    const dates = useDates()
    const userAbility = useAbility()
    const { data: blocked, isPending, isFetching, isError, error, refetch } = useQuery(useBlockedAddressesQuery())
    const { mutateAsync } = useUnblockMutation()
    const { remove, isHidden } = useUndoRemove<number>()

    const canUnblock = computed(() => userAbility.can('unblock', 'Bounce'))
    const visible = computed(() => (blocked.value ?? []).filter((block) => !isHidden(block.emailBlockId)))

    const headers = computed(() => [
        { key: 'emailAddress', title: t('module.bounces.blocked.columns.recipient'), sortable: false },
        { key: 'blockedUntil', title: t('module.bounces.blocked.columns.until'), sortable: false },
        { key: 'blockCount', title: t('module.bounces.blocked.columns.count'), sortable: false, align: 'end' as const },
        ...(canUnblock.value
            ? [
                  {
                      key: 'actions',
                      title: t('module.bounces.blocked.columns.actions'),
                      sortable: false,
                      align: 'end' as const,
                  },
              ]
            : []),
    ])

    function unblock(block: EmailBlockDto) {
        remove(block.emailBlockId, {
            text: t('module.bounces.blocked.unblocked', { email: block.emailAddress }),
            errorText: t('module.bounces.blocked.error', { email: block.emailAddress }),
            commit: () => mutateAsync(block.emailBlockId),
        })
    }
</script>

<style scoped>
    .blocked-table {
        background: rgb(var(--v-theme-surface));
    }
</style>
