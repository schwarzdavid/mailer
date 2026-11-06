<template>
    <FormDialog
        v-model="model"
        :title="t('module.inboundForms.add.title')"
        :submit-label="t('module.inboundForms.add.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="changed"
        @submit="onSubmit"
    >
        <p>{{ t('module.inboundForms.add.intro') }}</p>
        <VTextField
            v-model="name"
            name="name"
            :label="requiredLabel(t('field.name'))"
            :placeholder="t('module.inboundForms.add.namePlaceholder')"
            :error-messages="errors.name"
            aria-required="true"
        />
        <VSelect
            v-if="!soleDomain"
            v-model="domainId"
            name="domainId"
            :label="t('module.inboundForms.field.senderDomain')"
            :items="project?.domains ?? []"
            item-title="fqdn"
            item-value="domainId"
            clearable
            :hint="t('module.inboundForms.add.domainHint', { project: project?.name ?? '' })"
            persistent-hint
            :error-messages="errors.domainId"
        />
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { useRouter } from 'vue-router'
    import FormDialog from '@/components/FormDialog.vue'
    import { useFormChanged } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import { useInboundFormCreateMutation } from '@/modules/inbound-forms/mutations/useInboundFormCreateMutation.ts'
    import { soleProjectDomain } from '@/modules/inbound-forms/helpers/soleProjectDomain.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ projectId: number }>()
    const model = defineModel<boolean>({ required: true })

    const errorMessage = ref<string | null>(null)
    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const { data: project } = useQuery(useProjectQuery(() => props.projectId))
    const { mutateAsync, isPending } = useInboundFormCreateMutation()
    const router = useRouter()
    const soleDomain = computed(() => soleProjectDomain(project.value))

    const { defineField, handleSubmit, errors, resetForm, meta, values } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().trim().min(1).max(255),
                domainId: z.number().nullable().optional(),
            }),
        ),
    })

    const [name] = defineField('name')
    const [domainId] = defineField('domainId')

    const changed = useFormChanged(values, () => meta.value.initialValues)

    watch(
        model,
        (open) => {
            if (open) {
                errorMessage.value = null
                resetForm({ values: { domainId: null } })
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { inboundFormId } = await mutateAsync({
                name: values.name,
                domainId: soleDomain.value?.domainId ?? values.domainId ?? null,
                projectId: props.projectId,
            })
            model.value = false
            await router.push({ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId } })
            notify.success(t('module.inboundForms.add.success'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.inboundForms.add.error'))
        }
    })
</script>
