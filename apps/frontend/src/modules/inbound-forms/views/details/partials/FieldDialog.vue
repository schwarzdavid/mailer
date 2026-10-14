<template>
    <FormDialog
        v-model="model"
        width="lg"
        :title="
            field
                ? t('module.inboundForms.details.fields.dialog.editTitle', { key: field.key })
                : t('module.inboundForms.details.fields.add')
        "
        :submit-label="field ? t('cta.save') : t('module.inboundForms.details.fields.add')"
        :pending="saving"
        :error="error"
        :dirty="meta.dirty"
        @submit="onSubmit"
    >
        <div class="form-grid form-grid--2">
            <VTextField
                v-model="key"
                name="key"
                class="mono-field"
                :label="requiredLabel(t('module.inboundForms.details.fields.key'))"
                :hint="t('module.inboundForms.details.fields.dialog.keyHint')"
                persistent-hint
                :error-messages="errors.key"
                aria-required="true"
            />
            <VTextField
                v-model="label"
                name="label"
                :label="requiredLabel(t('module.inboundForms.details.fields.label'))"
                :hint="t('module.inboundForms.details.fields.dialog.labelHint')"
                persistent-hint
                :error-messages="errors.label"
                aria-required="true"
            />
            <VSelect
                v-model="type"
                name="type"
                :label="t('module.inboundForms.details.fields.type')"
                :items="typeOptions"
                :error-messages="errors.type"
            />
            <VTextField
                v-model="defaultValue"
                name="defaultValue"
                :label="t('module.inboundForms.details.fields.defaultValue')"
            />
            <VCheckbox
                v-model="required"
                class="span-2"
                name="required"
                :label="t('module.inboundForms.details.fields.required')"
                :messages="t('module.inboundForms.details.fields.dialog.requiredHint')"
            />
            <template v-if="type === 'text'">
                <h3 class="field-dialog__section span-2">
                    {{ t('module.inboundForms.details.fields.dialog.textRules') }}
                </h3>
                <VNumberInput
                    name="minLength"
                    :label="t('module.inboundForms.details.fields.minLength')"
                    :model-value="minLength ?? null"
                    :min="0"
                    :error-messages="errors.minLength"
                    @update:model-value="minLength = $event"
                />
                <VNumberInput
                    name="maxLength"
                    :label="t('module.inboundForms.details.fields.maxLength')"
                    :model-value="maxLength ?? null"
                    :min="0"
                    :error-messages="errors.maxLength"
                    @update:model-value="maxLength = $event"
                />
                <VTextField
                    v-model="pattern"
                    class="span-2 mono-field"
                    name="pattern"
                    :label="t('module.inboundForms.details.fields.pattern')"
                    :hint="t('module.inboundForms.details.fields.dialog.patternHint')"
                    persistent-hint
                    :error-messages="errors.pattern"
                />
            </template>
            <template v-if="type === 'number'">
                <h3 class="field-dialog__section span-2">
                    {{ t('module.inboundForms.details.fields.dialog.numberRules') }}
                </h3>
                <VNumberInput
                    name="min"
                    :label="t('module.inboundForms.details.fields.min')"
                    :model-value="min ?? null"
                    :error-messages="errors.min"
                    @update:model-value="min = $event"
                />
                <VNumberInput
                    name="max"
                    :label="t('module.inboundForms.details.fields.max')"
                    :model-value="max ?? null"
                    :error-messages="errors.max"
                    @update:model-value="max = $event"
                />
            </template>
        </div>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormFieldDto, InboundFormFieldUpsertDto, InboundFormFieldValidationDto } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'

    const props = withDefaults(
        defineProps<{
            field: InboundFormFieldDto | null
            existingKeys: string[]
            saving: boolean
            error?: string | null
        }>(),
        { error: null },
    )
    const model = defineModel<boolean>({ required: true })

    const emit = defineEmits<{ save: [field: InboundFormFieldUpsertDto] }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()

    const typeOptions = computed(() =>
        (['text', 'email', 'number', 'boolean'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.fields.typeOptions.${value}`),
        })),
    )

    function isValidPattern(pattern: string | undefined) {
        if (!pattern) {
            return true
        }
        try {
            new RegExp(pattern)
            return true
        } catch {
            return false
        }
    }

    const { defineField, handleSubmit, errors, resetForm, meta } = useForm({
        validationSchema: toTypedSchema(
            z
                .object({
                    key: z
                        .string()
                        .min(1)
                        .max(255)
                        .regex(/^[\w-]+$/, { error: () => t('module.inboundForms.validation.key') })
                        .refine((value) => value === props.field?.key || !props.existingKeys.includes(value), {
                            error: () => t('module.inboundForms.validation.keyTaken'),
                        }),
                    label: z.string().trim().min(1).max(255),
                    type: z.enum(['text', 'email', 'number', 'boolean']),
                    defaultValue: z.string().max(255).optional(),
                    required: z.boolean().optional(),
                    minLength: z.number().int().min(0).nullable().optional(),
                    maxLength: z.number().int().min(0).nullable().optional(),
                    pattern: z
                        .string()
                        .optional()
                        .refine(isValidPattern, { error: () => t('module.inboundForms.validation.pattern') }),
                    min: z.number().nullable().optional(),
                    max: z.number().nullable().optional(),
                })
                .refine(
                    (values) =>
                        values.minLength == null || values.maxLength == null || values.maxLength >= values.minLength,
                    {
                        path: ['maxLength'],
                        error: (issue) =>
                            t('module.inboundForms.validation.maxLength', {
                                min: (issue.input as { minLength?: number }).minLength ?? 0,
                            }),
                    },
                )
                .refine((values) => values.min == null || values.max == null || values.max >= values.min, {
                    path: ['max'],
                    error: (issue) =>
                        t('module.inboundForms.validation.max', { min: (issue.input as { min?: number }).min ?? 0 }),
                }),
        ),
    })

    const [key] = defineField('key')
    const [label] = defineField('label')
    const [type] = defineField('type')
    const [defaultValue] = defineField('defaultValue')
    const [required] = defineField('required')
    const [minLength] = defineField('minLength')
    const [maxLength] = defineField('maxLength')
    const [pattern] = defineField('pattern')
    const [min] = defineField('min')
    const [max] = defineField('max')

    watch(
        model,
        (open) => {
            if (!open) {
                return
            }
            resetForm({
                values: {
                    key: props.field?.key ?? '',
                    label: props.field?.label ?? '',
                    type: props.field?.type ?? 'text',
                    defaultValue: props.field?.defaultValue ?? undefined,
                    required: props.field?.validation?.required ?? false,
                    minLength: props.field?.validation?.minLength ?? null,
                    maxLength: props.field?.validation?.maxLength ?? null,
                    pattern: props.field?.validation?.pattern ?? undefined,
                    min: props.field?.validation?.min ?? null,
                    max: props.field?.validation?.max ?? null,
                },
            })
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit((values) => {
        const validation: InboundFormFieldValidationDto = {}
        if (values.required) {
            validation.required = true
        }
        if (values.type === 'text') {
            if (values.minLength != null) {
                validation.minLength = values.minLength
            }
            if (values.maxLength != null) {
                validation.maxLength = values.maxLength
            }
            if (values.pattern) {
                validation.pattern = values.pattern
            }
        }
        if (values.type === 'number') {
            if (values.min != null) {
                validation.min = values.min
            }
            if (values.max != null) {
                validation.max = values.max
            }
        }

        emit('save', {
            key: values.key,
            label: values.label,
            type: values.type,
            defaultValue: values.defaultValue || null,
            validation: Object.keys(validation).length > 0 ? validation : null,
        })
    })
</script>

<style scoped>
    .field-dialog__section {
        margin: 4px 0 -8px;
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }
</style>
