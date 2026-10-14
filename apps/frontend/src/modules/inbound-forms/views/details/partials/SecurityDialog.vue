<template>
    <FormDialog
        v-model="model"
        :title="
            scheme
                ? t('module.inboundForms.details.security.dialog.editTitle')
                : t('module.inboundForms.details.security.add')
        "
        :submit-label="scheme ? t('cta.save') : t('module.inboundForms.details.security.add')"
        :pending="saving"
        :error="error"
        :dirty="meta.dirty"
        @submit="onSubmit"
    >
        <VSelect
            v-model="type"
            name="type"
            :label="requiredLabel(t('module.inboundForms.details.security.type'))"
            :items="typeOptions"
            :disabled="scheme !== null"
            :append-inner-icon="scheme ? mdiLockOutline : undefined"
            :hint="scheme ? t('module.inboundForms.details.security.dialog.typeLocked') : undefined"
            :persistent-hint="scheme !== null"
            :error-messages="errors.type"
        />
        <div class="form-grid form-grid--2">
            <VSelect
                v-model="location"
                name="location"
                :label="requiredLabel(t('module.inboundForms.details.security.location'))"
                :items="locationOptions"
                :error-messages="errors.location"
            />
            <VTextField
                v-model="key"
                name="key"
                class="mono-field"
                :label="requiredLabel(t('module.inboundForms.details.security.key'))"
                :error-messages="errors.key"
            />
        </div>
        <template v-if="type === 'google-recaptcha'">
            <PasswordField
                v-model="secret"
                class="mono-field"
                name="secret"
                autocomplete="off"
                :label="
                    hasStoredSecret
                        ? t('module.inboundForms.details.security.secret')
                        : requiredLabel(t('module.inboundForms.details.security.secret'))
                "
                :hint="hasStoredSecret ? t('module.inboundForms.details.security.secretKeepHint') : undefined"
                :persistent-hint="hasStoredSecret"
                :error-messages="errors.secret"
            />
            <VNumberInput
                name="minScore"
                :label="t('module.inboundForms.details.security.minScore')"
                :model-value="minScore ?? null"
                :min="0"
                :max="1"
                :step="0.1"
                :precision="1"
                inputmode="decimal"
                :hint="t('module.inboundForms.details.security.dialog.minScoreHint')"
                persistent-hint
                :error-messages="errors.minScore"
                @update:model-value="minScore = $event"
            />
        </template>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { mdiLockOutline } from '@mdi/js'
    import type { InboundFormRecaptchaConfigUpsertDto, InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import PasswordField from '@/components/PasswordField.vue'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'

    type EditableType = 'google-recaptcha' | 'honeypot'

    const props = withDefaults(
        defineProps<{
            scheme: InboundFormSecurityDto | null
            takenTypes: InboundFormSecurityDto['type'][]
            saving: boolean
            error?: string | null
        }>(),
        { error: null },
    )
    const model = defineModel<boolean>({ required: true })

    const emit = defineEmits<{ save: [scheme: InboundFormSecurityUpsertDto] }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()

    const typeOptions = computed(() =>
        (['google-recaptcha', 'honeypot'] as const)
            .filter((value) => props.scheme?.type === value || !props.takenTypes.includes(value))
            .map((value) => ({ value, title: t(`module.inboundForms.details.security.typeOptions.${value}`) })),
    )

    const locationOptions = computed(() =>
        (['body', 'header', 'query'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.security.locationOptions.${value}`),
        })),
    )

    const hasStoredSecret = computed(
        () => props.scheme?.type === 'google-recaptcha' && props.scheme.config?.hasSecret === true,
    )

    const { defineField, handleSubmit, errors, resetForm, meta } = useForm({
        validationSchema: toTypedSchema(
            z
                .object({
                    type: z.enum(['google-recaptcha', 'honeypot']),
                    location: z.enum(['body', 'header', 'query']),
                    key: z.string().trim().min(1).max(255),
                    secret: z.string().optional(),
                    minScore: z.number().min(0).max(1).nullable().optional(),
                })
                .refine((values) => values.type !== 'google-recaptcha' || !!values.secret || hasStoredSecret.value, {
                    path: ['secret'],
                    error: () => t('validation.required'),
                }),
        ),
    })

    const [type] = defineField('type')
    const [location] = defineField('location')
    const [key] = defineField('key')
    const [secret] = defineField('secret')
    const [minScore] = defineField('minScore')

    function defaultType(): EditableType {
        if (props.scheme?.type === 'google-recaptcha') {
            return 'google-recaptcha'
        }
        if (props.scheme) {
            return 'honeypot'
        }
        return typeOptions.value[0]?.value ?? 'honeypot'
    }

    watch(
        model,
        (open) => {
            if (!open) {
                return
            }
            resetForm({
                values: {
                    type: defaultType(),
                    location: props.scheme?.location ?? 'body',
                    key: props.scheme?.key ?? '',
                    secret: undefined,
                    minScore: props.scheme?.config?.minScore ?? null,
                },
            })
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit((values) => {
        let config: InboundFormRecaptchaConfigUpsertDto | null = null
        if (values.type === 'google-recaptcha') {
            config = values.secret
                ? { secret: values.secret, minScore: values.minScore ?? undefined }
                : { minScore: values.minScore ?? undefined }
        }

        emit('save', { type: values.type, location: values.location, key: values.key, config })
    })
</script>
