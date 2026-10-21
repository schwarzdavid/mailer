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
        <VTextField
            v-model="slug"
            name="slug"
            class="mono-field"
            :label="requiredLabel(t('field.slug'))"
            :prefix="SLUG_PREFIX"
            :hint="t('module.inboundForms.add.slugHint')"
            persistent-hint
            :error-messages="errors.slug"
            aria-required="true"
            @update:model-value="slugTouched = true"
        />
        <VSelect
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
    import { ref, watch } from 'vue'
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
    import { SLUG_PATTERN, SLUG_PREFIX, slugify } from '@/modules/inbound-forms/helpers/slug.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ projectId: number }>()
    const model = defineModel<boolean>({ required: true })

    const slugTouched = ref(false)
    const errorMessage = ref<string | null>(null)
    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const { data: project } = useQuery(useProjectQuery(() => props.projectId))
    const { mutateAsync, isPending } = useInboundFormCreateMutation()
    const router = useRouter()

    const { defineField, handleSubmit, errors, resetForm, meta, values } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().trim().min(1).max(255),
                slug: z
                    .string()
                    .min(1)
                    .max(255)
                    .regex(SLUG_PATTERN, { error: () => t('module.inboundForms.validation.slug') }),
                domainId: z.number().nullable().optional(),
            }),
        ),
    })

    const [name] = defineField('name')
    const [slug] = defineField('slug')
    const [domainId] = defineField('domainId')

    const changed = useFormChanged(values, () => meta.value.initialValues)

    watch(name, (value) => {
        if (!slugTouched.value) {
            slug.value = slugify(value ?? '')
        }
    })

    watch(
        model,
        (open) => {
            if (open) {
                errorMessage.value = null
                slugTouched.value = false
                resetForm({
                    values: {
                        domainId: project.value?.domains.length === 1 ? project.value.domains[0]!.domainId : null,
                    },
                })
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { inboundFormId } = await mutateAsync({
                name: values.name,
                slug: values.slug,
                domainId: values.domainId ?? null,
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
