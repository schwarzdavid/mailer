<template>
    <SectionCard :title="t('module.roles.details.profile.title')">
        <form v-if="canUpdate" :id="formId" class="form-grid form-grid--2" novalidate @submit.prevent="onSubmit">
            <InlineAlert
                v-if="errorMessage"
                class="span-2"
                tone="error"
                :title="t('module.roles.details.profile.error')"
                :text="errorMessage"
            />
            <VTextField
                v-model="name"
                name="name"
                :label="requiredLabel(t('field.name'))"
                :error-messages="errors.name"
                aria-required="true"
            />
            <VTextField
                v-model="description"
                name="description"
                :label="t('module.roles.details.profile.description')"
                :error-messages="errors.description"
            />
        </form>
        <div v-else class="form-grid form-grid--2">
            <ReadonlyValue :label="t('field.name')" :value="role.name" />
            <ReadonlyValue :label="t('module.roles.details.profile.description')" :value="role.description" />
        </div>
        <template v-if="canUpdate" #footer>
            <SaveFooter :form="formId" :dirty="meta.dirty" :pending="isPending" @discard="discard" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { ref, useId, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { RoleDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useRoleUpdateMutation } from '@/modules/roles/mutations/useRoleUpdateMutation.ts'

    const props = defineProps<{ role: RoleDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const formId = useId()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useRoleUpdateMutation()

    function initialValues(role: RoleDto) {
        return { name: role.name, description: role.description ?? '' }
    }

    const { defineField, handleSubmit, errors, meta, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().trim().min(1).max(100),
                description: z.string().trim().max(255).optional().or(z.literal('')),
            }),
        ),
        initialValues: initialValues(props.role),
    })

    const [name] = defineField('name')
    const [description] = defineField('description')

    useDirtyGuard(() => meta.value.dirty)

    watch(
        () => props.role,
        (role) => {
            if (!meta.value.dirty) {
                resetForm({ values: initialValues(role) })
            }
        },
    )

    function discard() {
        errorMessage.value = null
        resetForm({ values: initialValues(props.role) })
    }

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync({
                roleId: props.role.roleId,
                body: { name: values.name, description: values.description ? values.description : null },
            })
            resetForm({ values })
            notify.success(t('module.roles.details.profile.saved'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    })
</script>
