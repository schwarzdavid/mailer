<template>
    <FormDialog
        v-model="model"
        :title="t('module.projects.add.title')"
        :submit-label="t('module.projects.add.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="meta.dirty"
        @submit="onSubmit"
    >
        <p>{{ t('module.projects.add.intro') }}</p>
        <VTextField
            v-model="name"
            name="name"
            :label="requiredLabel(t('field.name'))"
            :placeholder="t('module.projects.add.placeholder')"
            :error-messages="errors.name"
            aria-required="true"
        />
    </FormDialog>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import FormDialog from '@/components/FormDialog.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useProjectCreateMutation } from '@/modules/projects/mutations/useProjectCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const model = defineModel<boolean>({ required: true })
    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const { mutateAsync, isPending } = useProjectCreateMutation()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)

    const { defineField, handleSubmit, errors, resetForm, meta } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z
                    .string({ error: () => t('module.projects.add.nameRequired') })
                    .trim()
                    .min(1, { error: () => t('module.projects.add.nameRequired') })
                    .max(255),
            }),
        ),
    })

    const [name] = defineField('name')

    watch(
        model,
        (open) => {
            if (open) {
                errorMessage.value = null
                resetForm()
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { projectId } = await mutateAsync({ name: values.name })
            model.value = false
            await router.push({ name: RouteNames.PROJECT_DETAILS, params: { projectId } })
            notify.success(t('module.projects.add.success'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.add.error'))
        }
    })
</script>
