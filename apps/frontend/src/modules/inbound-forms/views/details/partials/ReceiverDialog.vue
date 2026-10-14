<template>
    <FormDialog
        v-model="model"
        :title="
            receiver
                ? t('module.inboundForms.details.receivers.dialog.editTitle')
                : t('module.inboundForms.details.receivers.add')
        "
        :submit-label="receiver ? t('cta.save') : t('module.inboundForms.details.receivers.add')"
        :pending="saving"
        :error="error"
        :dirty="meta.dirty"
        @submit="onSubmit"
    >
        <VTextField
            v-model="emailFrom"
            name="emailFrom"
            class="mono-field"
            :label="requiredLabel(t('module.inboundForms.details.receivers.from'))"
            :hint="
                domainFqdn
                    ? t('module.inboundForms.details.receivers.dialog.senderHint', { domain: domainFqdn })
                    : t('module.inboundForms.details.receivers.dialog.noDomain')
            "
            persistent-hint
            :error-messages="errors.emailFrom"
            aria-required="true"
        />
        <VCombobox
            v-model="emailReceiver"
            name="emailReceiver"
            class="mono-field"
            :label="requiredLabel(t('module.inboundForms.details.receivers.to'))"
            :items="placeholderItems"
            item-title="value"
            item-value="value"
            :return-object="false"
            :hint="t('module.inboundForms.details.receivers.dialog.recipientHint', { placeholder: placeholderExample })"
            persistent-hint
            :error-messages="errors.emailReceiver"
            aria-required="true"
        >
            <template #item="{ props: itemProps, item }">
                <VListItem v-bind="itemProps" :subtitle="item.label" />
            </template>
        </VCombobox>
        <VCombobox
            v-model="emailReplyTo"
            name="emailReplyTo"
            class="mono-field"
            :label="t('module.inboundForms.details.receivers.replyTo')"
            :items="placeholderItems"
            item-title="value"
            item-value="value"
            :return-object="false"
            clearable
            :placeholder="t('module.inboundForms.details.receivers.dialog.none')"
            :hint="t('module.inboundForms.details.receivers.dialog.recipientHint', { placeholder: placeholderExample })"
            persistent-hint
        >
            <template #item="{ props: itemProps, item }">
                <VListItem v-bind="itemProps" :subtitle="item.label" />
            </template>
        </VCombobox>
        <VSwitch
            v-model="isActive"
            name="isActive"
            :label="t('status.active')"
            :messages="t('module.inboundForms.details.receivers.dialog.activeHint')"
        />
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormReceiverCreateDto, InboundFormReceiverDto } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'

    const props = withDefaults(
        defineProps<{
            receiver: InboundFormReceiverDto | null
            emailFields: { key: string; label: string }[]
            domainFqdn: string | null
            saving: boolean
            error?: string | null
        }>(),
        { error: null },
    )
    const model = defineModel<boolean>({ required: true })

    const emit = defineEmits<{ save: [receiver: InboundFormReceiverCreateDto] }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()

    const placeholderItems = computed(() =>
        props.emailFields.map((field) => ({ value: `{{${field.key}}}`, label: field.label })),
    )
    const placeholderExample = computed(() => placeholderItems.value[0]?.value ?? '{{email}}')

    const { defineField, handleSubmit, errors, resetForm, meta, setFieldValue } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                emailFrom: z.email().refine((value) => !props.domainFqdn || value.endsWith(`@${props.domainFqdn}`), {
                    error: () =>
                        t('module.inboundForms.details.receivers.dialog.senderDomain', { domain: props.domainFqdn }),
                }),
                emailReceiver: z.string().trim().min(1),
                emailReplyTo: z.string().nullable().optional(),
                isActive: z.boolean(),
            }),
        ),
    })

    const [emailFrom] = defineField('emailFrom')
    const [emailReceiver] = defineField('emailReceiver')
    const [emailReplyTo] = defineField('emailReplyTo')
    const [isActive] = defineField('isActive')

    function defaultSender(fqdn: string | null): string {
        return fqdn ? `noreply@${fqdn}` : ''
    }

    watch(
        () => props.domainFqdn,
        (fqdn) => {
            if (model.value && !props.receiver && fqdn && !emailFrom.value) {
                setFieldValue('emailFrom', defaultSender(fqdn), false)
            }
        },
    )

    watch(
        model,
        (open) => {
            if (!open) {
                return
            }
            resetForm({
                values: {
                    emailFrom: props.receiver?.emailFrom ?? defaultSender(props.domainFqdn),
                    emailReceiver: props.receiver?.emailReceiver ?? '',
                    emailReplyTo: props.receiver?.emailReplyTo ?? null,
                    isActive: props.receiver?.isActive ?? true,
                },
            })
        },
        { immediate: true },
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
