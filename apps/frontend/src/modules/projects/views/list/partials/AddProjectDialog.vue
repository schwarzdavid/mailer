<template>
    <VDialog max-width="600" v-model="model" @after-leave="onAfterLeave" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.projects.add.title')">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" :disabled="isPending" />
            </template>
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                    <p class="mb-4">{{ t('module.projects.add.intro') }}</p>
                    <VTextField name="name" :label="t('field.name')" v-model="name" :error-messages="errors.name" />
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                    <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import { useProjectCreateMutation } from '@/modules/projects/mutations/useProjectCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const model = ref<undefined | boolean>()
    const { t } = useI18n()
    const { mutateAsync, isPending } = useProjectCreateMutation()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().min(1).max(255),
            }),
        ),
    })

    const [name] = defineField('name')

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { projectId } = await mutateAsync({ name: values.name })
            void router.push({ name: RouteNames.PROJECT_DETAILS, params: { projectId } })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.add.error'))
        }
    })

    function onAfterLeave() {
        errorMessage.value = null
        resetForm()
    }
</script>
