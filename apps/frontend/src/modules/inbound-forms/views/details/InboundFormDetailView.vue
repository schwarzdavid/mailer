<template>
    <PageHeader :title="form?.name" :loading="isPending" :breadcrumbs="breadcrumbs">
        <template v-if="form" #status>
            <StatusBadge v-bind="activityBadge(form.isActive)" large />
        </template>
        <template v-if="form" #meta>
            <span v-if="senderDomain" class="mono">{{ senderDomain.fqdn }}</span>
            <span>{{
                t('module.inboundForms.receiverCount', { count: form.receivers.length }, form.receivers.length)
            }}</span>
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        :kind="apiErrorStatus(error) === 404 ? 'notFound' : 'load'"
        size="page"
        :thing="t('module.inboundForms.details.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    >
        <template #actions>
            <VBtn
                variant="text"
                :to="{ name: RouteNames.PROJECT_LIST }"
                :text="t('module.projects.details.backToList')"
            />
        </template>
    </ErrorState>
    <PageSkeleton v-else-if="isPending" :cards="3" :label="t('module.inboundForms.details.loading')" />
    <div v-else-if="form" class="page-stack">
        <EndpointCard :form="form" :can-update="canUpdate" />
        <GeneralCard :form="form" :project="project" :can-update="canUpdate" />
        <FieldsCard :form="form" :can-update="canUpdate" />
        <SecurityCard :form="form" :can-update="canUpdate" />
        <ReceiversCard :form="form" :sender-domain="senderDomain?.fqdn ?? null" :can-update="canUpdate" />
        <FormDangerZone v-if="canDelete" :form="form" />
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import ErrorState from '@/components/ErrorState.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import PageSkeleton from '@/components/skeletons/PageSkeleton.vue'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import { useReceiverStatus } from '@/modules/inbound-forms/helpers/receiverStatus.ts'
    import { useInboundFormQuery } from '@/modules/inbound-forms/queries/useInboundFormQuery.ts'
    import EndpointCard from '@/modules/inbound-forms/views/details/partials/EndpointCard.vue'
    import FieldsCard from '@/modules/inbound-forms/views/details/partials/FieldsCard.vue'
    import FormDangerZone from '@/modules/inbound-forms/views/details/partials/FormDangerZone.vue'
    import GeneralCard from '@/modules/inbound-forms/views/details/partials/GeneralCard.vue'
    import ReceiversCard from '@/modules/inbound-forms/views/details/partials/ReceiversCard.vue'
    import SecurityCard from '@/modules/inbound-forms/views/details/partials/SecurityCard.vue'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import type { Breadcrumb } from '@/components/breadcrumb.ts'

    const route = useRoute()
    const { t } = useI18n()
    const userAbility = useAbility()
    const { activityBadge } = useReceiverStatus()

    const {
        data: form,
        isPending,
        isError,
        error,
        isFetching,
        refetch,
    } = useQuery(useInboundFormQuery(() => Number(route.params.inboundFormId)))
    const projectId = computed(() => form.value?.projectId ?? 0)
    const { queryKey: projectKey, queryFn: projectFn } = useProjectQuery(projectId)
    const { data: project } = useQuery({
        queryKey: projectKey,
        queryFn: projectFn,
        enabled: computed(() => !!form.value),
    })

    const projectSubject = computed(() => subject('Project', { projectId: projectId.value }))
    const canUpdate = computed(() => userAbility.can('update', projectSubject.value))
    const canDelete = computed(() => userAbility.can('delete', projectSubject.value))

    const senderDomain = computed(() =>
        project.value?.domains.find((domain) => domain.domainId === form.value?.domainId),
    )

    const breadcrumbs = computed(() => {
        const crumbs: Breadcrumb[] = [{ title: t('nav.projects'), to: { name: RouteNames.PROJECT_LIST } }]
        if (project.value) {
            crumbs.push({
                title: project.value.name,
                to: { name: RouteNames.PROJECT_DETAILS, params: { projectId: project.value.projectId } },
            })
        }
        return crumbs
    })
</script>
