<template>
    <VDialog max-width="600" v-model="model" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.projects.details.delete.title')">
            <VCardItem>
                <p>{{ t('module.projects.details.delete.intro') }}</p>
            </VCardItem>
            <VCardActions>
                <VSpacer />
                <VBtn :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                <VBtn color="error" variant="elevated" :text="t('cta.delete')" :loading="isPending" @click="remove" />
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import type { ProjectDetailDto } from 'api'
    import { useProjectDeleteMutation } from '@/modules/projects/mutations/useProjectDeleteMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ project: ProjectDetailDto }>()

    const model = ref<undefined | boolean>()
    const { t } = useI18n()
    const { mutateAsync, isPending } = useProjectDeleteMutation()
    const router = useRouter()

    async function remove() {
        await mutateAsync(props.project.projectId)
        model.value = false
        void router.push({ name: RouteNames.PROJECT_LIST })
    }
</script>
