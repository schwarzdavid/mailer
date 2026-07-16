<template>
    <VCard :to="{ name: RouteNames.PROJECT_DETAILS, params: { projectId: project.projectId } }" hover>
        <VCardItem>
            <template #title>
                {{ project.name }}
            </template>
            <template #subtitle>
                {{
                    t('module.projects.list.counts', {
                        forms: project.inboundFormCount,
                        domains: project.domainCount,
                    })
                }}
            </template>
        </VCardItem>
    </VCard>
</template>

<script setup lang="ts">
    import type { ProjectListDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { RouteNames } from '@/router/RouteNames.ts'

    defineProps<{ project: ProjectListDto }>()

    const { t } = useI18n()
</script>
