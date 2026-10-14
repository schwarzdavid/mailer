<template>
    <PageHeader :title="project?.name" :loading="isPending" :breadcrumbs="breadcrumbs">
        <template v-if="project && !canUpdate" #status>
            <TagLabel :label="t('module.projects.details.readOnly')" />
        </template>
        <template v-if="project" #meta>
            <span v-for="part in metaParts" :key="part">{{ part }}</span>
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        :kind="apiErrorStatus(error) === 404 ? 'notFound' : 'load'"
        size="page"
        :thing="t('module.projects.details.thing')"
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
    <PageSkeleton v-else-if="isPending" :cards="2" :label="t('module.projects.details.loading')" />
    <div v-else-if="project" class="page-stack">
        <InlineAlert
            v-if="!canUpdate"
            tone="info"
            :title="t('module.projects.details.readOnlyAlert.title')"
            :text="t('module.projects.details.readOnlyAlert.text')"
        />
        <ProjectFormsCard :project="project" :can-update="canUpdate" />
        <ProjectDomainsCard v-if="canReadDomains" :project="project" :can-update="canUpdate" />
        <ProjectMembersCard v-if="canManageMembers" :project="project" />
        <ProjectGeneralCard :project="project" :can-update="canUpdate" />
        <ProjectDangerZone v-if="canDelete" :project="project" :form-count="forms?.length ?? 0" />
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useRoute } from 'vue-router'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import ErrorState from '@/components/ErrorState.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import PageSkeleton from '@/components/skeletons/PageSkeleton.vue'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import { useInboundFormsQuery } from '@/modules/inbound-forms/queries/useInboundFormsQuery.ts'
    import { useProjectCountParts } from '@/modules/projects/helpers/useProjectCounts.ts'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import ProjectDangerZone from '@/modules/projects/views/details/partials/ProjectDangerZone.vue'
    import ProjectDomainsCard from '@/modules/projects/views/details/partials/ProjectDomainsCard.vue'
    import ProjectFormsCard from '@/modules/projects/views/details/partials/ProjectFormsCard.vue'
    import ProjectGeneralCard from '@/modules/projects/views/details/partials/ProjectGeneralCard.vue'
    import ProjectMembersCard from '@/modules/projects/views/details/partials/ProjectMembersCard.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const route = useRoute()
    const userAbility = useAbility()
    const countParts = useProjectCountParts()

    const projectId = computed(() => Number(route.params.projectId))
    const { data: project, isPending, isError, error, isFetching, refetch } = useQuery(useProjectQuery(projectId))
    const { data: forms } = useQuery(useInboundFormsQuery(projectId))

    const projectSubject = computed(() => subject('Project', { projectId: projectId.value }))
    const canUpdate = computed(() => userAbility.can('update', projectSubject.value))
    const canDelete = computed(() => userAbility.can('delete', projectSubject.value))
    const canReadDomains = computed(() => userAbility.can('read', 'Domain'))
    const canManageMembers = computed(() => userAbility.can('update', 'User') || canUpdate.value)

    const breadcrumbs = computed(() => [{ title: t('nav.projects'), to: { name: RouteNames.PROJECT_LIST } }])

    const metaParts = computed(() =>
        countParts({
            forms: forms.value?.length,
            domains: project.value?.domains.length,
        }),
    )
</script>
