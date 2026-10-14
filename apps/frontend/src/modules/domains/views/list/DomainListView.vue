<template>
    <PageHeader :title="t('module.domains.list.title')" :description="t('module.domains.list.description')">
        <template v-if="canCreate" #actions>
            <VBtn
                variant="flat"
                color="primary"
                :prepend-icon="mdiPlus"
                :text="t('module.domains.list.create')"
                @click="createOpen = true"
            />
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        size="page"
        :thing="t('module.domains.list.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    />
    <EmptyState
        v-else-if="domains && domains.length === 0"
        size="page"
        :icon="mdiWeb"
        :title="t('module.domains.list.empty.title')"
        :text="t('module.domains.list.empty.text')"
    >
        <template v-if="canCreate" #actions>
            <VBtn
                variant="flat"
                color="primary"
                :prepend-icon="mdiPlus"
                :text="t('module.domains.list.create')"
                @click="createOpen = true"
            />
        </template>
    </EmptyState>
    <VCard v-else class="domain-list">
        <ListSkeleton v-if="isPending" :label="t('module.domains.list.loading')" />
        <ListRow
            v-for="domain in domains"
            v-else
            :key="domain.domainId"
            :icon="mdiWeb"
            :title="domain.fqdn"
            mono-title
            :to="{ name: RouteNames.DOMAIN_DETAILS, params: { domainId: domain.domainId } }"
        >
            <template #subtitle>
                <i18n-t v-if="domain.lastCheckedAt" keypath="dns.checkedAt" tag="span">
                    <template #time><RelativeTime :value="domain.lastCheckedAt" /></template>
                </i18n-t>
                <span v-else>{{ t('dns.neverChecked') }}</span>
            </template>
            <template #meta>
                <StatusBadge v-bind="domainStatus.domainBadge(domain)" />
            </template>
        </ListRow>
    </VCard>

    <AddDomainDialog v-if="canCreate" v-model="createOpen" />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { mdiPlus, mdiWeb } from '@mdi/js'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import { useDomainStatus } from '@/modules/domains/helpers/domainStatus.ts'
    import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
    import AddDomainDialog from '@/modules/domains/views/list/partials/AddDomainDialog.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const userAbility = useAbility()
    const domainStatus = useDomainStatus()
    const { data: domains, isPending, isError, error, isFetching, refetch } = useQuery(useDomainsQuery())
    const createOpen = ref(false)

    const canCreate = computed(() => userAbility.can('create', 'Domain'))
</script>

<style scoped>
    .domain-list {
        background: rgb(var(--v-theme-surface));
    }
</style>
