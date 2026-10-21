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
        :dirty="changed"
        @submit="onSubmit"
    >
        <VSelect
            v-model="type"
            name="type"
            :label="requiredLabel(t('module.inboundForms.details.security.type'))"
            :items="typeOptions"
            :disabled="scheme !== null"
            :append-inner-icon="scheme ? mdiLockOutline : undefined"
            :hint="typeHint"
            :persistent-hint="typeHint !== undefined"
            :error-messages="errors.type"
        />
        <div class="form-grid form-grid--2">
            <VSelect
                v-if="type !== 'honeypot'"
                v-model="location"
                name="location"
                :label="requiredLabel(t('module.inboundForms.details.security.location'))"
                :items="locationOptions"
                :error-messages="errors.location"
            />
            <VTextField
                v-model="key"
                name="key"
                :class="['mono-field', { 'span-2': type === 'honeypot' }]"
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
            <VTextField
                v-model="expectedAction"
                name="expectedAction"
                class="mono-field"
                :label="t('module.inboundForms.details.security.expectedAction')"
                :hint="t('module.inboundForms.details.security.dialog.expectedActionHint')"
                persistent-hint
                :error-messages="errors.expectedAction"
            />
        </template>
        <div v-else-if="type === 'timed-token'" class="form-grid form-grid--2">
            <VNumberInput
                name="minDelaySeconds"
                :label="requiredLabel(t('module.inboundForms.details.security.minDelaySeconds'))"
                :model-value="minDelaySeconds ?? null"
                :hint="t('module.inboundForms.details.security.dialog.minDelayHint')"
                persistent-hint
                :error-messages="errors.minDelaySeconds"
                @update:model-value="minDelaySeconds = $event"
            />
            <VNumberInput
                name="maxAgeSeconds"
                :label="requiredLabel(t('module.inboundForms.details.security.maxAgeSeconds'))"
                :model-value="maxAgeSeconds ?? null"
                :hint="t('module.inboundForms.details.security.dialog.maxAgeHint')"
                persistent-hint
                :error-messages="errors.maxAgeSeconds"
                @update:model-value="maxAgeSeconds = $event"
            />
        </div>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { mdiLockOutline } from '@mdi/js'
    import type { InboundFormSecurityConfigUpsertDto, InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import { useFormChanged } from '@/composables/useDirtyGuard.ts'
    import PasswordField from '@/components/PasswordField.vue'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'

    type EditableType = InboundFormSecurityDto['type']

    const TIMED_TOKEN_KEY = 'formToken'
    const DEFAULT_MIN_DELAY_SECONDS = 3
    const DEFAULT_MAX_AGE_SECONDS = 3600

    const props = withDefaults(
        defineProps<{
            scheme: InboundFormSecurityDto | null
            takenTypes: InboundFormSecurityDto['type'][]
            hasHostnames: boolean
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
        (['google-recaptcha', 'honeypot', 'timed-token'] as const)
            .filter((value) => props.scheme?.type === value || !props.takenTypes.includes(value))
            .map((value) => ({
                value,
                title: t(`module.inboundForms.details.security.typeOptions.${value}`),
                props: { disabled: value === 'timed-token' && props.scheme === null && !props.hasHostnames },
            })),
    )

    const typeHint = computed(() => {
        if (props.scheme) {
            return t('module.inboundForms.details.security.dialog.typeLocked')
        }
        if (!props.hasHostnames && typeOptions.value.some((option) => option.value === 'timed-token')) {
            return t('module.inboundForms.details.security.dialog.timedTokenNeedsHostnames')
        }
        return undefined
    })

    const locationOptions = computed(() =>
        (['body', 'header', 'query'] as const).map((value) => ({
            value,
            title: t(`module.inboundForms.details.security.locationOptions.${value}`),
        })),
    )

    const hasStoredSecret = computed(
        () => props.scheme?.type === 'google-recaptcha' && props.scheme.config?.hasSecret === true,
    )

    const { defineField, handleSubmit, errors, resetForm, meta, values } = useForm({
        validationSchema: toTypedSchema(
            z
                .object({
                    type: z.enum(['google-recaptcha', 'honeypot', 'timed-token']),
                    location: z.enum(['body', 'header', 'query']),
                    key: z.string().trim().min(1).max(255),
                    secret: z.string().optional(),
                    minScore: z.number().min(0).max(1).nullable().optional(),
                    expectedAction: z.string().trim().max(100).optional(),
                    minDelaySeconds: z.number().int().min(1).max(60).nullable().optional(),
                    maxAgeSeconds: z.number().int().min(60).max(86400).nullable().optional(),
                })
                .refine((values) => values.type !== 'google-recaptcha' || !!values.secret || hasStoredSecret.value, {
                    path: ['secret'],
                    error: () => t('validation.required'),
                })
                .refine((values) => values.type !== 'timed-token' || typeof values.minDelaySeconds === 'number', {
                    path: ['minDelaySeconds'],
                    error: () => t('validation.required'),
                })
                .refine((values) => values.type !== 'timed-token' || typeof values.maxAgeSeconds === 'number', {
                    path: ['maxAgeSeconds'],
                    error: () => t('validation.required'),
                }),
        ),
    })

    const [type] = defineField('type')
    const [location] = defineField('location')
    const [key] = defineField('key')
    const [secret] = defineField('secret')
    const [minScore] = defineField('minScore')
    const [expectedAction] = defineField('expectedAction')
    const [minDelaySeconds] = defineField('minDelaySeconds')
    const [maxAgeSeconds] = defineField('maxAgeSeconds')

    const changed = useFormChanged(values, () => meta.value.initialValues)

    function defaultType(): EditableType {
        if (props.scheme) {
            return props.scheme.type
        }
        return typeOptions.value.find((option) => !option.props.disabled)?.value ?? 'honeypot'
    }

    function defaultKey(schemeType: EditableType) {
        return schemeType === 'timed-token' ? TIMED_TOKEN_KEY : ''
    }

    watch(type, (next, previous) => {
        if (props.scheme || !previous || key.value !== defaultKey(previous)) {
            return
        }
        key.value = next ? defaultKey(next) : ''
    })

    watch(
        model,
        (open) => {
            if (!open) {
                return
            }
            const initialType = defaultType()
            resetForm({
                values: {
                    type: initialType,
                    location: props.scheme?.location ?? 'body',
                    key: props.scheme?.key ?? defaultKey(initialType),
                    secret: undefined,
                    minScore: props.scheme?.config?.minScore ?? null,
                    expectedAction: props.scheme?.config?.expectedAction ?? '',
                    minDelaySeconds: props.scheme?.config?.minDelaySeconds ?? DEFAULT_MIN_DELAY_SECONDS,
                    maxAgeSeconds: props.scheme?.config?.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
                },
            })
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit((values) => {
        let config: InboundFormSecurityConfigUpsertDto | null = null
        if (values.type === 'google-recaptcha') {
            config = {
                minScore: values.minScore ?? undefined,
                expectedAction: values.expectedAction || undefined,
            }
            if (values.secret) {
                config.secret = values.secret
            }
        } else if (values.type === 'timed-token') {
            config = {
                minDelaySeconds: values.minDelaySeconds ?? undefined,
                maxAgeSeconds: values.maxAgeSeconds ?? undefined,
            }
        }

        const schemeLocation = values.type === 'honeypot' ? 'body' : values.location
        emit('save', { type: values.type, location: schemeLocation, key: values.key, config })
    })
</script>
