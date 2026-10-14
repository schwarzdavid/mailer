<template>
    <FormDialog
        v-model="model"
        width="sm"
        :title="t('module.projects.apiKeys.dialog.title')"
        :submit-label="t('module.projects.apiKeys.dialog.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="name.trim() !== ''"
        @submit="onSubmit"
    >
        <p>{{ t('module.projects.apiKeys.dialog.intro') }}</p>
        <VTextField
            v-model="name"
            name="name"
            :label="requiredLabel(t('module.projects.apiKeys.dialog.name'))"
            :error-messages="fieldError"
            maxlength="100"
            aria-required="true"
        />
    </FormDialog>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { ApiKeyCreatedDto, ProjectDetailDto } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useApiKeyCreateMutation } from '@/modules/projects/mutations/useApiKeyCreateMutation.ts'

    const props = defineProps<{ project: ProjectDetailDto }>()
    const emit = defineEmits<{ created: [apiKey: ApiKeyCreatedDto] }>()
    const model = defineModel<boolean>({ required: true })

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const { mutateAsync, isPending, reset } = useApiKeyCreateMutation()

    const name = ref('')
    const fieldError = ref<string | undefined>()
    const errorMessage = ref<string | null>(null)

    watch(
        model,
        (open) => {
            if (open) {
                name.value = ''
                fieldError.value = undefined
                errorMessage.value = null
            }
        },
        { immediate: true },
    )

    async function onSubmit() {
        fieldError.value = undefined
        errorMessage.value = null
        const trimmed = name.value.trim()
        if (!trimmed) {
            fieldError.value = t('module.projects.apiKeys.dialog.nameRequired')
            return
        }
        try {
            const created = await mutateAsync({ projectId: props.project.projectId, name: trimmed })
            model.value = false
            emit('created', created)
            reset()
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.apiKeys.dialog.error'))
        }
    }
</script>
