<template>
    <VDialog max-width="600" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
        <VCard :title="receiver ? t('cta.edit') : t('module.inboundForms.details.receivers.add')">
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VTextField
                        name="emailFrom"
                        :label="t('module.inboundForms.details.receivers.from')"
                        :hint="domainFqdn ? `@${domainFqdn}` : undefined"
                        v-model="emailFrom"
                        :error-messages="errors.emailFrom"
                    />
                    <VCombobox
                        name="emailReceiver"
                        :label="t('module.inboundForms.details.receivers.to')"
                        :hint="
                            t('module.inboundForms.details.receivers.recipientHint', {
                                placeholder: placeholderExample,
                            })
                        "
                        :items="placeholderItems"
                        v-model="emailReceiver"
                        :error-messages="errors.emailReceiver"
                    />
                    <VCombobox
                        name="emailReplyTo"
                        :label="t('module.inboundForms.details.receivers.replyTo')"
                        :items="placeholderItems"
                        clearable
                        v-model="emailReplyTo"
                    />
                    <VSwitch name="isActive" :label="t('module.inboundForms.status.active')" v-model="isActive" />
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
    import type { InboundFormReceiverCreateDto, InboundFormReceiverDto } from 'api'

    const props = defineProps<{
        modelValue: boolean
        receiver: InboundFormReceiverDto | null
        emailFieldKeys: string[]
        domainFqdn: string | null
        saving: boolean
    }>()

    const emit = defineEmits<{
        'update:modelValue': [value: boolean]
        save: [receiver: InboundFormReceiverCreateDto]
    }>()

    const { t } = useI18n()

    const placeholderItems = computed(() => props.emailFieldKeys.map((key) => `{{${key}}}`))
    const placeholderExample = computed(() => placeholderItems.value[0] ?? '{{email}}')

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                emailFrom: z.email(),
                emailReceiver: z.string().min(1),
                emailReplyTo: z.string().nullable().optional(),
                isActive: z.boolean(),
            }),
        ),
    })

    const [emailFrom] = defineField('emailFrom')
    const [emailReceiver] = defineField('emailReceiver')
    const [emailReplyTo] = defineField('emailReplyTo')
    const [isActive] = defineField('isActive')

    watch(
        () => props.modelValue,
        (open) => {
            if (!open) {
                return
            }
            resetForm({
                values: {
                    emailFrom: props.receiver?.emailFrom ?? (props.domainFqdn ? `noreply@${props.domainFqdn}` : ''),
                    emailReceiver: props.receiver?.emailReceiver ?? '',
                    emailReplyTo: props.receiver?.emailReplyTo ?? null,
                    isActive: props.receiver?.isActive ?? true,
                },
            })
        },
    )

    const onSubmit = handleSubmit((values) => {
        emit('save', {
            emailFrom: values.emailFrom,
            emailReceiver: values.emailReceiver,
            emailReplyTo: values.emailReplyTo || null,
            isActive: values.isActive,
        })
    })
</script>
