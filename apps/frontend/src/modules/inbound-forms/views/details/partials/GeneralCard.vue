<template>
    <SectionCard :title="t('module.inboundForms.details.general.title')">
        <form v-if="canUpdate" :id="formId" class="form-grid" novalidate @submit.prevent="onSubmit">
            <InlineAlert v-if="errorMessage" tone="error" :title="t('dialog.saveFailed')" :text="errorMessage" />
            <VTextField
                v-model="name"
                name="name"
                :label="requiredLabel(t('field.name'))"
                :error-messages="errors.name"
                aria-required="true"
            />
            <VTextField
                v-model="slug"
                name="slug"
                class="mono-field"
                :label="requiredLabel(t('field.slug'))"
                :prefix="SLUG_PREFIX"
                :hint="t('module.inboundForms.details.general.slugHint')"
                persistent-hint
                :error-messages="errors.slug"
                aria-required="true"
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
        </form>
        <div v-else class="form-grid">
            <ReadonlyValue :label="t('field.name')" :value="form.name" />
            <ReadonlyValue :label="t('field.slug')" :value="form.slug" mono />
            <ReadonlyValue :label="t('module.inboundForms.field.senderDomain')" :value="domainName" mono />
        </div>
        <template v-if="canUpdate" #footer>
            <SaveFooter :form="formId" :dirty="meta.dirty" :pending="isPending" @discard="discard" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed, ref, useId, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, ProjectDetailDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { SLUG_PATTERN, SLUG_PREFIX } from '@/modules/inbound-forms/helpers/slug.ts'
    import { useInboundFormUpdateMutation } from '@/modules/inbound-forms/mutations/useInboundFormUpdateMutation.ts'

    const props = withDefaults(
        defineProps<{ form: InboundFormDetailDto; project?: ProjectDetailDto; canUpdate: boolean }>(),
        { project: undefined },
    )

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const formId = useId()
    const { mutateAsync, isPending } = useInboundFormUpdateMutation()
    const errorMessage = ref<string | null>(null)

    const domainName = computed(
        () => props.project?.domains.find((domain) => domain.domainId === props.form.domainId)?.fqdn ?? null,
    )

    function initialValues(form: InboundFormDetailDto) {
        return { name: form.name, slug: form.slug, domainId: form.domainId }
    }

    const { defineField, handleSubmit, errors, meta, resetForm } = useForm({
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
        initialValues: initialValues(props.form),
    })

    const [name] = defineField('name')
    const [slug] = defineField('slug')
    const [domainId] = defineField('domainId')

    useDirtyGuard(() => meta.value.dirty)

    watch(
        () => props.form,
        (form) => {
            if (!meta.value.dirty) {
                resetForm({ values: initialValues(form) })
            }
        },
    )

    function discard() {
        errorMessage.value = null
        resetForm({ values: initialValues(props.form) })
    }

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const updated = await mutateAsync({
                inboundFormId: props.form.inboundFormId,
                update: { name: values.name, slug: values.slug, domainId: values.domainId ?? null },
            })
            resetForm({ values: initialValues(updated) })
            notify.success(t('module.inboundForms.details.general.saved'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    })
</script>
