<template>
    <PageHeader
        :title="t('module.projects.messages.title')"
        :description="t('module.projects.messages.description')"
        :breadcrumbs="breadcrumbs"
    />
    <MessageTable :project-id="projectId" />
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useRoute } from 'vue-router'
    import PageHeader from '@/components/PageHeader.vue'
    import type { Breadcrumb } from '@/components/breadcrumb.ts'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import MessageTable from '@/modules/projects/views/messages/partials/MessageTable.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const route = useRoute()

    const projectId = computed(() => Number(route.params.projectId))
    const { data: project } = useQuery(useProjectQuery(projectId))

    const breadcrumbs = computed<Breadcrumb[]>(() => [
        { title: t('nav.projects'), to: { name: RouteNames.PROJECT_LIST } },
        {
            title: project.value?.name ?? '…',
            to: { name: RouteNames.PROJECT_DETAILS, params: { projectId: projectId.value } },
        },
    ])
</script>
