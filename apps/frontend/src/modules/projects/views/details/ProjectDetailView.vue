<template>
    <VContainer v-if="project">
        <div class="d-flex align-center gc-3">
            <VBtn icon="mdi-arrow-left" variant="text" size="small" :to="{ name: RouteNames.PROJECT_LIST }" />
            <h1>{{ project.name }}</h1>
        </div>
        <VDivider class="mb-6" />
        <div class="d-flex flex-column gr-6">
            <ProjectGeneralCard :project="project" />
            <ProjectDomainsCard :project="project" />
            <ProjectFormsCard :project="project" />
        </div>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import ProjectGeneralCard from '@/modules/projects/views/details/partials/ProjectGeneralCard.vue'
    import ProjectDomainsCard from '@/modules/projects/views/details/partials/ProjectDomainsCard.vue'
    import ProjectFormsCard from '@/modules/projects/views/details/partials/ProjectFormsCard.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const route = useRoute()
    const { data: project } = useQuery(useProjectQuery(() => Number(route.params.projectId)))
</script>
