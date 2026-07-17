<template>
    <VContainer>
        <div class="d-flex justify-space-between align-center">
            <h1>{{ t('module.projects.list.title') }}</h1>
            <AddProjectDialog v-if="can('create', 'Project')" v-slot="{ props }">
                <VBtn v-bind="props">{{ t('cta.add') }}</VBtn>
            </AddProjectDialog>
        </div>
        <VDivider />
        <VFadeTransition leave-absolute>
            <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
                <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
            </div>
            <div class="d-flex flex-column gr-3 pt-6" v-else>
                <p v-if="projects && projects.length === 0">{{ t('module.projects.list.empty') }}</p>
                <ProjectListEntry v-for="project in projects" :key="project.projectId" :project="project" />
            </div>
        </VFadeTransition>
        <DeletedProjectsCard />
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { useProjectsQuery } from '@/modules/projects/queries/useProjectsQuery.ts'
    import ProjectListEntry from '@/modules/projects/views/list/partials/ProjectListEntry.vue'
    import AddProjectDialog from '@/modules/projects/views/list/partials/AddProjectDialog.vue'
    import DeletedProjectsCard from '@/modules/projects/views/list/partials/DeletedProjectsCard.vue'

    const { data: projects, isPending } = useQuery(useProjectsQuery())
    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)
</script>
