<template>
    <SectionCard :title="t('module.projects.details.general.title')">
        <form v-if="canUpdate" id="project-general" class="project-general" novalidate @submit.prevent="onSubmit">
            <InlineAlert v-if="errorMessage" tone="error" :title="t('dialog.saveFailed')" :text="errorMessage" />
            <VTextField
                v-model="name"
                name="name"
                :label="requiredLabel(t('module.projects.details.general.name'))"
                :error-messages="errors.name"
                aria-required="true"
            />
        </form>
        <ReadonlyValue v-else :label="t('module.projects.details.general.name')" :value="project.name" />
        <template v-if="canUpdate" #footer>
            <SaveFooter form="project-general" :dirty="meta.dirty" :pending="isPending" @discard="discard" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { ProjectDetailDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useProjectUpdateMutation } from '@/modules/projects/mutations/useProjectUpdateMutation.ts'

    const props = defineProps<{ project: ProjectDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const { mutateAsync, isPending } = useProjectUpdateMutation()
    const errorMessage = ref<string | null>(null)

    const { defineField, handleSubmit, errors, meta, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z
                    .string()
                    .trim()
                    .min(1, { error: () => t('module.projects.add.nameRequired') })
                    .max(255),
            }),
        ),
        initialValues: { name: props.project.name },
    })

    const [name] = defineField('name')

    useDirtyGuard(() => meta.value.dirty)

    watch(
        () => props.project.name,
        (value) => {
            if (!meta.value.dirty) {
                resetForm({ values: { name: value } })
            }
        },
    )

    function discard() {
        errorMessage.value = null
        resetForm({ values: { name: props.project.name } })
    }

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync({ projectId: props.project.projectId, update: { name: values.name } })
            resetForm({ values: { name: values.name } })
            notify.success(t('module.projects.details.general.saved'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.details.general.error'))
        }
    })
</script>

<style scoped>
    .project-general {
        display: grid;
        gap: 20px;
    }
</style>
