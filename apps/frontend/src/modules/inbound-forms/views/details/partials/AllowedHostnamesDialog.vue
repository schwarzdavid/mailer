<template>
    <FormDialog
        v-model="model"
        :title="t('module.inboundForms.details.security.hostnames.dialog.title')"
        :submit-label="t('cta.save')"
        :pending="saving"
        :error="error"
        @submit="onSubmit"
    >
        <VCombobox
            v-model="entries"
            name="hostnames"
            class="mono-field"
            :label="t('module.inboundForms.details.security.hostnames.label')"
            :hint="t('module.inboundForms.details.security.hostnames.hint')"
            persistent-hint
            :delimiters="[',', ' ']"
            :error-messages="hostnameError"
            multiple
            chips
            closable-chips
        />
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import FormDialog from '@/components/FormDialog.vue'

    const props = withDefaults(defineProps<{ hostnames: string[]; saving: boolean; error?: string | null }>(), {
        error: null,
    })
    const model = defineModel<boolean>({ required: true })

    const emit = defineEmits<{ save: [hostnames: string[]] }>()

    const { t } = useI18n()

    const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
    const MAX_HOSTNAME_LENGTH = 253

    function isHostname(value: string) {
        return value.length <= MAX_HOSTNAME_LENGTH && value.split('.').every((label) => HOSTNAME_LABEL.test(label))
    }

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                hostnames: z.array(
                    z
                        .string()
                        .transform((value) => value.trim().toLowerCase())
                        .refine(isHostname, { error: () => t('validation.hostname') }),
                ),
            }),
        ),
    })

    const [field] = defineField('hostnames')

    const entries = computed({
        get: () => (field.value ?? []).filter((value) => value !== undefined),
        set: (value) => {
            field.value = value
        },
    })

    const hostnameError = computed(() => {
        const messages = Object.entries(errors.value)
            .filter(([path]) => path.startsWith('hostnames'))
            .flatMap(([, message]) => (message ? [message] : []))
        return [...new Set(messages)]
    })

    watch(
        model,
        (open) => {
            if (open) {
                resetForm({ values: { hostnames: [...props.hostnames] } })
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit((values) => {
        emit('save', [...new Set(values.hostnames)])
    })
</script>
