<template>
    <div v-if="projects && projects.length > 0" class="pt-10">
        <h2>{{ t('module.projects.deleted.title') }}</h2>
        <VDivider />
        <VAlert v-if="errorMessage" type="error" class="mt-6" :text="errorMessage" />
        <div class="d-flex flex-column gr-3 pt-6">
            <VCard v-for="project in projects" :key="project.projectId">
                <VCardItem>
                    <template #title>
                        {{ project.name }}
                    </template>
                    <template #subtitle>
                        {{
                            t('module.projects.deleted.purgeAt', {
                                date: new Date(project.purgeAt).toLocaleString(),
                            })
                        }}
                    </template>
                    <template #append>
                        <VBtn
                            :text="t('module.projects.deleted.restore')"
                            :loading="isPending && restoringId === project.projectId"
                            @click="restore(project.projectId)"
                        />
                    </template>
                </VCardItem>
            </VCard>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useDeletedProjectsQuery } from '@/modules/projects/queries/useDeletedProjectsQuery.ts'
    import { useProjectRestoreMutation } from '@/modules/projects/mutations/useProjectRestoreMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const { t } = useI18n()
    const { data: projects } = useQuery(useDeletedProjectsQuery())
    const { mutateAsync, isPending } = useProjectRestoreMutation()
    const restoringId = ref<number | null>(null)
    const errorMessage = ref<string | null>(null)

    async function restore(projectId: number) {
        errorMessage.value = null
        restoringId.value = projectId
        try {
            await mutateAsync(projectId)
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.deleted.error'))
        } finally {
            restoringId.value = null
        }
    }
</script>
