<template>
    <VDialog max-width="600" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
        <VCard :title="scheme ? t('cta.edit') : t('module.inboundForms.details.security.add')">
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VSelect
                        name="type"
                        :label="t('module.inboundForms.details.security.type')"
                        v-model="type"
                        :items="typeOptions"
                        :disabled="scheme !== null"
                        :error-messages="errors.type"
                    />
                    <VSelect
                        name="location"
                        :label="t('module.inboundForms.details.security.location')"
                        v-model="location"
                        :items="locationOptions"
                        :error-messages="errors.location"
                    />
                    <VTextField
                        name="key"
                        :label="t('module.inboundForms.details.security.key')"
                        v-model="key"
                        :error-messages="errors.key"
                    />
                    <template v-if="type === 'google-recaptcha'">
                        <VTextField
                            name="secret"
                            :label="t('module.inboundForms.details.security.secret')"
                            v-model="secret"
                            :error-messages="errors.secret"
                        />
                        <VNumberInput
                            name="minScore"
                            :label="t('module.inboundForms.details.security.minScore')"
                            :model-value="minScore ?? null"
                            :min="0"
                            :max="1"
                            :step="0.1"
                            :error-messages="errors.minScore"
                            @update:model-value="minScore = $event"
                        />
                    </template>
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
    import type { InboundFormRecaptchaConfigDto, InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'

    const props = defineProps<{
        modelValue: boolean
        scheme: InboundFormSecurityDto | null
        saving: boolean
    }>()

    const emit = defineEmits<{
        'update:modelValue': [value: boolean]
        save: [scheme: InboundFormSecurityUpsertDto]
    }>()

    const { t } = useI18n()

    const typeOptions = computed(() =>
        (['google-recaptcha', 'honeypot'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.security.typeOptions.${value}`),
        })),
    )

    const locationOptions = computed(() =>
        (['body', 'header', 'query'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.security.locationOptions.${value}`),
        })),
    )

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z
                .object({
                    type: z.enum(['google-recaptcha', 'honeypot']),
                    location: z.enum(['body', 'header', 'query']),
                    key: z.string().min(1).max(255),
                    secret: z.string().optional(),
                    minScore: z.number().min(0).max(1).nullable().optional(),
                })
                .refine((values) => values.type !== 'google-recaptcha' || !!values.secret, {
                    path: ['secret'],
                    error: t('validation.required'),
                }),
        ),
    })

    const [type] = defineField('type')
    const [location] = defineField('location')
    const [key] = defineField('key')
    const [secret] = defineField('secret')
    const [minScore] = defineField('minScore')

    function toEditableType(schemeType: InboundFormSecurityDto['type'] | undefined): 'google-recaptcha' | 'honeypot' {
        return schemeType === 'google-recaptcha' ? 'google-recaptcha' : 'honeypot'
    }

    watch(
        () => props.modelValue,
        (open) => {
            if (!open) {
                return
            }
            resetForm({
                values: {
                    type: toEditableType(props.scheme?.type),
                    location: props.scheme?.location ?? 'body',
                    key: props.scheme?.key ?? '',
                    secret: props.scheme?.config?.secret ?? undefined,
                    minScore: props.scheme?.config?.minScore ?? null,
                },
            })
        },
    )

    const onSubmit = handleSubmit((values) => {
        let config: InboundFormRecaptchaConfigDto | null = null
        if (values.type === 'google-recaptcha' && values.secret) {
            config = { secret: values.secret, minScore: values.minScore ?? undefined }
        }

        emit('save', {
            type: values.type,
            location: values.location,
            key: values.key,
            config,
        })
    })
</script>
