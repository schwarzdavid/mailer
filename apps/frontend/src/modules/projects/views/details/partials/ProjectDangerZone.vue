<template>
    <SectionCard
        danger
        :title="t('module.projects.details.delete.title')"
        :description="
            t('module.projects.details.delete.description', { name: project.name, count: formCount }, formCount)
        "
    >
        <template #actions>
            <VBtn color="error" :text="t('module.projects.details.delete.action')" @click="confirmDelete" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import type { ProjectDetailDto } from 'api'
    import SectionCard from '@/components/SectionCard.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useProjectDeleteMutation } from '@/modules/projects/mutations/useProjectDeleteMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ project: ProjectDetailDto; formCount: number }>()

    const { t } = useI18n()
    const confirm = useConfirm()
    const notify = useNotify()
    const router = useRouter()
    const { mutateAsync } = useProjectDeleteMutation()

    async function confirmDelete() {
        const confirmed = await confirm({
            title: t('module.projects.details.delete.confirmTitle', { name: props.project.name }),
            body: t(
                'module.projects.details.delete.confirmBody',
                { name: props.project.name, count: props.formCount },
                props.formCount,
            ),
            confirmLabel: t('module.projects.details.delete.confirm'),
            destructive: true,
            errorText: t('module.projects.details.delete.error'),
            action: () => mutateAsync(props.project.projectId),
        })
        if (!confirmed) {
            return
        }
        await router.push({ name: RouteNames.PROJECT_LIST })
        notify.success(t('module.projects.details.delete.done', { name: props.project.name }), {
            link: { label: t('module.projects.details.delete.view'), to: { name: RouteNames.PROJECT_LIST } },
        })
    }
</script>
