<template>
    <VDialog max-width="700" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
        <VCard :title="field ? t('cta.edit') : t('module.inboundForms.details.fields.add')">
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VRow dense>
                        <VCol cols="6">
                            <VTextField
                                name="key"
                                :label="t('module.inboundForms.details.fields.key')"
                                v-model="key"
                                :error-messages="errors.key"
                            />
                        </VCol>
                        <VCol cols="6">
                            <VTextField
                                name="label"
                                :label="t('module.inboundForms.details.fields.label')"
                                v-model="label"
                                :error-messages="errors.label"
                            />
                        </VCol>
                        <VCol cols="6">
                            <VSelect
                                name="type"
                                :label="t('module.inboundForms.details.fields.type')"
                                v-model="type"
                                :items="typeOptions"
                                :error-messages="errors.type"
                            />
                        </VCol>
                        <VCol cols="6">
                            <VTextField
                                name="defaultValue"
                                :label="t('module.inboundForms.details.fields.defaultValue')"
                                v-model="defaultValue"
                            />
                        </VCol>
                        <VCol cols="12">
                            <VCheckbox
                                name="required"
                                :label="t('module.inboundForms.details.fields.required')"
                                v-model="required"
                            />
                        </VCol>
                        <template v-if="type === 'text'">
                            <VCol cols="4">
                                <VNumberInput
                                    name="minLength"
                                    :label="t('module.inboundForms.details.fields.minLength')"
                                    :model-value="minLength ?? null"
                                    :min="0"
                                    @update:model-value="minLength = $event"
                                />
                            </VCol>
                            <VCol cols="4">
                                <VNumberInput
                                    name="maxLength"
                                    :label="t('module.inboundForms.details.fields.maxLength')"
                                    :model-value="maxLength ?? null"
                                    :min="0"
                                    @update:model-value="maxLength = $event"
                                />
                            </VCol>
                            <VCol cols="4">
                                <VTextField
                                    name="pattern"
                                    :label="t('module.inboundForms.details.fields.pattern')"
                                    v-model="pattern"
                                />
                            </VCol>
                        </template>
                        <template v-if="type === 'number'">
                            <VCol cols="6">
                                <VNumberInput
                                    name="min"
                                    :label="t('module.inboundForms.details.fields.min')"
                                    :model-value="min ?? null"
                                    @update:model-value="min = $event"
                                />
                            </VCol>
                            <VCol cols="6">
                                <VNumberInput
                                    name="max"
                                    :label="t('module.inboundForms.details.fields.max')"
                                    :model-value="max ?? null"
                                    @update:model-value="max = $event"
                                />
                            </VCol>
                        </template>
                    </VRow>
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="t('cta.abort')" @click="emit('update:modelValue', false)" />
                    <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="saving" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormFieldDto, InboundFormFieldUpsertDto, InboundFormFieldValidationDto } from 'api'

    const props = defineProps<{
        modelValue: boolean
        field: InboundFormFieldDto | null
        saving: boolean
    }>()

    const emit = defineEmits<{
        'update:modelValue': [value: boolean]
        save: [field: InboundFormFieldUpsertDto]
    }>()

    const { t } = useI18n()

    const typeOptions = computed(() =>
        (['text', 'email', 'number', 'boolean'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.fields.typeOptions.${value}`),
        })),
    )

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                key: z
                    .string()
                    .min(1)
                    .max(255)
                    .regex(/^[\w-]+$/),
                label: z.string().min(1).max(255),
                type: z.enum(['text', 'email', 'number', 'boolean']),
                defaultValue: z.string().max(255).optional(),
                required: z.boolean().optional(),
                minLength: z.number().int().min(0).nullable().optional(),
                maxLength: z.number().int().min(0).nullable().optional(),
                pattern: z.string().optional(),
                min: z.number().nullable().optional(),
                max: z.number().nullable().optional(),
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
        () => props.modelValue,
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
