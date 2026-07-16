<template>
    <VCard :title="t('module.projects.details.general.title')">
        <form @submit.prevent="onSubmit">
            <VCardItem>
                <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                <VTextField name="name" :label="t('field.name')" v-model="name" :error-messages="errors.name" />
            </VCardItem>
            <VCardActions>
                <DeleteProjectDialog :project="project" v-slot="{ props: activator }">
                    <VBtn color="error" v-bind="activator" :text="t('cta.delete')" />
                </DeleteProjectDialog>
                <VSpacer />
                <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" type="submit" />
            </VCardActions>
        </form>
    </VCard>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { ProjectDetailDto } from 'api'
    import { useProjectUpdateMutation } from '@/modules/projects/mutations/useProjectUpdateMutation.ts'
    import DeleteProjectDialog from '@/modules/projects/views/details/partials/DeleteProjectDialog.vue'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ project: ProjectDetailDto }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useProjectUpdateMutation()
    const errorMessage = ref<string | null>(null)

    const { defineField, handleSubmit, errors } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().min(1).max(255),
            }),
        ),
        initialValues: {
            name: props.project.name,
        },
    })

    const [name] = defineField('name')

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync({ projectId: props.project.projectId, update: { name: values.name } })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.details.general.error'))
        }
    })
</script>
