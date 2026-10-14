<template>
    <PageHeader :title="t('module.projects.list.title')" :description="t('module.projects.list.description')">
        <template v-if="canCreate" #actions>
            <VBtn
                variant="flat"
                color="primary"
                :prepend-icon="mdiPlus"
                :text="t('module.projects.list.create')"
                @click="createOpen = true"
            />
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        size="page"
        :thing="t('module.projects.list.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    />
    <EmptyState
        v-else-if="projects && projects.length === 0"
        size="page"
        :icon="mdiFolderOutline"
        :title="canCreate ? t('module.projects.list.empty.title') : t('module.projects.list.emptyLimited.title')"
        :text="canCreate ? t('module.projects.list.empty.text') : t('module.projects.list.emptyLimited.text')"
    >
        <template v-if="canCreate" #actions>
            <VBtn
                variant="flat"
                color="primary"
                :prepend-icon="mdiPlus"
                :text="t('module.projects.list.create')"
                @click="createOpen = true"
            />
        </template>
    </EmptyState>
    <div v-else class="page-stack">
        <VCard class="project-list" :aria-busy="isPending || undefined">
            <ListSkeleton v-if="isPending" :label="t('module.projects.list.loading')" />
            <ListRow
                v-for="project in projects"
                v-else
                :key="project.projectId"
                :icon="mdiFolderOutline"
                :title="project.name"
                :subtitle="counts(project)"
                :to="{ name: RouteNames.PROJECT_DETAILS, params: { projectId: project.projectId } }"
            >
                <template v-if="!project.domainsHealthy" #meta>
                    <StatusBadge tone="warning" :label="t('module.projects.list.domainInvalid')" />
                </template>
            </ListRow>
        </VCard>
        <DeletedProjectsCard />
    </div>

    <AddProjectDialog v-model="createOpen" />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { mdiFolderOutline, mdiPlus } from '@mdi/js'
    import type { ProjectListDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import { useProjectsQuery } from '@/modules/projects/queries/useProjectsQuery.ts'
    import { useProjectCounts } from '@/modules/projects/helpers/useProjectCounts.ts'
    import AddProjectDialog from '@/modules/projects/views/list/partials/AddProjectDialog.vue'
    import DeletedProjectsCard from '@/modules/projects/views/list/partials/DeletedProjectsCard.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const userAbility = useAbility()
    const { data: projects, isPending, isError, error, isFetching, refetch } = useQuery(useProjectsQuery())
    const projectCounts = useProjectCounts()
    const createOpen = ref(false)

    const canCreate = computed(() => userAbility.can('create', 'Project'))

    function counts(project: ProjectListDto) {
        return projectCounts({
            forms: project.inboundFormCount,
            domains: project.domainCount,
            members: project.memberCount,
        })
    }
</script>

<style scoped>
    .project-list {
        background: rgb(var(--v-theme-surface));
    }
</style>
