<template>
    <SectionCard
        v-if="projects && projects.length > 0"
        :title="t('module.projects.deleted.title')"
        :description="t('module.projects.deleted.description')"
        :count="projects.length"
        flush
    >
        <ListRow
            v-for="project in projects"
            :key="project.projectId"
            :icon="mdiFolderOutline"
            :title="project.name"
            :pending="restoringId === project.projectId"
        >
            <template #subtitle>
                <template v-if="restoringId === project.projectId">{{
                    t('module.projects.deleted.restoring')
                }}</template>
                <template v-else>
                    {{
                        t('module.projects.deleted.purgeAt', {
                            date: dates.day(project.purgeAt),
                            relative: dates.relativeDays(project.purgeAt),
                        })
                    }}
                    <VTooltip activator="parent" :text="dates.absolute(project.purgeAt)" />
                </template>
            </template>
            <template #actions>
                <VBtn
                    size="small"
                    :text="t('module.projects.deleted.restore')"
                    :loading="restoringId === project.projectId"
                    @click="restore(project)"
                />
            </template>
        </ListRow>
    </SectionCard>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { mdiFolderOutline } from '@mdi/js'
    import type { DeletedProjectDto } from 'api'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDates } from '@/composables/useDates.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useDeletedProjectsQuery } from '@/modules/projects/queries/useDeletedProjectsQuery.ts'
    import { useProjectRestoreMutation } from '@/modules/projects/mutations/useProjectRestoreMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const dates = useDates()
    const notify = useNotify()
    const { data: projects } = useQuery(useDeletedProjectsQuery())
    const { mutateAsync } = useProjectRestoreMutation()
    const restoringId = ref<number | null>(null)

    async function restore(project: DeletedProjectDto) {
        restoringId.value = project.projectId
        try {
            await mutateAsync(project.projectId)
            notify.success(t('module.projects.deleted.restored', { name: project.name }), {
                link: {
                    label: t('module.projects.deleted.open'),
                    to: { name: RouteNames.PROJECT_DETAILS, params: { projectId: project.projectId } },
                },
            })
        } catch {
            notify.error(t('module.projects.deleted.error', { name: project.name }), {
                retry: () => void restore(project),
            })
        } finally {
            restoringId.value = null
        }
    }
</script>
