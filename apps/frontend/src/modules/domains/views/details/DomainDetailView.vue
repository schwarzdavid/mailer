<template>
    <PageHeader :title="domain?.fqdn" :loading="isPending" :breadcrumbs="breadcrumbs">
        <template v-if="domain" #status>
            <StatusBadge v-bind="domainStatus.domainBadge(domain)" large />
        </template>
        <template v-if="domain" #meta>
            <span>
                {{
                    domain.projects.length
                        ? t('module.domains.details.usedBy', {
                              names: domain.projects.map((project) => project.name).join(', '),
                          })
                        : t('module.domains.details.unused')
                }}
            </span>
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        :kind="apiErrorStatus(error) === 404 ? 'notFound' : 'load'"
        size="page"
        :thing="t('module.domains.details.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    >
        <template #actions>
            <VBtn
                variant="text"
                :to="{ name: RouteNames.DOMAIN_LIST }"
                :text="t('module.domains.details.backToList')"
            />
        </template>
    </ErrorState>
    <SectionCard v-else-if="isPending" :title="t('dns.title')" flush>
        <DnsRecordSkeleton />
    </SectionCard>
    <div v-else-if="domain" class="page-stack">
        <DnsRecordsCard
            :records="records"
            :checked-at="domain.lastCheckedAt"
            :checking="isChecking"
            :can-check="canUpdate"
            @check="check"
        />
        <SectionCard
            :title="t('module.domains.details.projects.title')"
            :description="t('module.domains.details.projects.description')"
            :count="domain.projects.length"
            flush
        >
            <EmptyState
                v-if="domain.projects.length === 0"
                :icon="mdiFolderOutline"
                :title="t('module.domains.details.projects.empty.title')"
                :text="t('module.domains.details.projects.empty.text')"
            />
            <ListRow
                v-for="project in domain.projects"
                :key="project.projectId"
                :icon="mdiFolderOutline"
                :title="project.name"
                :to="{ name: RouteNames.PROJECT_DETAILS, params: { projectId: project.projectId } }"
            />
        </SectionCard>
        <SectionCard
            v-if="canDelete"
            danger
            :title="t('module.domains.details.delete.title')"
            :description="
                domain.projects.length
                    ? t('module.domains.details.delete.blocked', {
                          fqdn: domain.fqdn,
                          names: domain.projects.map((project) => project.name).join(', '),
                      })
                    : t('module.domains.details.delete.description', { fqdn: domain.fqdn })
            "
        >
            <template #actions>
                <VBtn
                    color="error"
                    :disabled="domain.projects.length > 0"
                    :text="t('module.domains.details.delete.action')"
                    @click="confirmDelete"
                />
            </template>
        </SectionCard>
    </div>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { useRouteParams } from '@vueuse/router'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import { useAbility } from '@casl/vue'
    import { mdiFolderOutline } from '@mdi/js'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import DnsRecordsCard from '@/components/dns/DnsRecordsCard.vue'
    import DnsRecordSkeleton from '@/components/skeletons/DnsRecordSkeleton.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import { domainRecords, useDomainStatus } from '@/modules/domains/helpers/domainStatus.ts'
    import { useDomainDeleteMutation } from '@/modules/domains/mutations/useDomainDeleteMutation.ts'
    import { useDomainRefreshMutation } from '@/modules/domains/mutations/useDomainRefreshMutation.ts'
    import { useDomainQuery } from '@/modules/domains/queries/useDomainQuery.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const router = useRouter()
    const userAbility = useAbility()
    const confirm = useConfirm()
    const notify = useNotify()
    const domainStatus = useDomainStatus()
    const domainId = useRouteParams('domainId', '', { transform: Number })
    const { data: domain, isPending, isError, error, isFetching, refetch } = useQuery(useDomainQuery(domainId))
    const { mutateAsync: refresh, isPending: isChecking } = useDomainRefreshMutation()
    const { mutateAsync: deleteDomain } = useDomainDeleteMutation()

    const canUpdate = computed(() => userAbility.can('update', 'Domain'))
    const canDelete = computed(() => userAbility.can('delete', 'Domain'))
    const records = computed(() => (domain.value ? domainRecords(domain.value) : []))
    const breadcrumbs = computed(() => [{ title: t('nav.domains'), to: { name: RouteNames.DOMAIN_LIST } }])

    async function check() {
        const fqdn = domain.value?.fqdn ?? ''
        const wasValid = records.value.filter((record) => record.status === 'valid').length
        try {
            const result = await refresh(domainId.value)
            const nowValid = domainRecords(result).filter((record) => record.status === 'valid').length
            if (nowValid === wasValid && nowValid < records.value.length) {
                notify.info(t('module.domains.details.stillInvalid'))
            }
        } catch {
            notify.error(t('module.domains.details.checkFailed', { fqdn }), { retry: () => void check() })
        }
    }

    async function confirmDelete() {
        const fqdn = domain.value?.fqdn ?? ''
        const confirmed = await confirm({
            title: t('module.domains.details.delete.confirmTitle', { fqdn }),
            body: t('module.domains.details.delete.confirmBody'),
            confirmLabel: t('module.domains.details.delete.confirm'),
            destructive: true,
            errorText: t('module.domains.details.delete.error'),
            action: () => deleteDomain(domainId.value),
        })
        if (!confirmed) {
            return
        }
        await router.push({ name: RouteNames.DOMAIN_LIST })
        notify.success(t('module.domains.details.delete.done', { fqdn }))
    }
</script>
