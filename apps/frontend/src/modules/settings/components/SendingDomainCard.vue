<template>
    <SectionCard
        :title="t('module.settings.sendingDomain.title')"
        :description="t('module.settings.sendingDomain.description')"
    >
        <form v-if="canUpdate" :id="formId" class="form-grid form-grid--2" novalidate @submit.prevent="onSubmit">
            <InlineAlert
                v-if="errorMessage"
                class="span-2"
                tone="error"
                :title="t('module.settings.sendingDomain.error')"
                :text="errorMessage"
            />
            <VTextField
                v-model="fqdn"
                name="fqdn"
                class="span-2 mono-field"
                :label="requiredLabel(t('field.domain'))"
                placeholder="mail.example.com"
                :hint="t('module.settings.sendingDomain.domainHint')"
                persistent-hint
                :error-messages="errors.fqdn"
                aria-required="true"
            />
            <VTextField
                v-model="serverIpv4"
                name="serverIpv4"
                class="mono-field"
                :label="requiredLabel(t('field.serverIpv4'))"
                placeholder="203.0.113.10"
                :error-messages="errors.serverIpv4"
                aria-required="true"
            />
            <VTextField
                v-model="serverIpv6"
                name="serverIpv6"
                class="mono-field"
                :label="t('field.serverIpv6')"
                placeholder="2001:db8::10"
                :error-messages="errors.serverIpv6"
            />
        </form>
        <div v-else class="form-grid form-grid--2">
            <ReadonlyValue class="span-2" :label="t('field.domain')" :value="sendingDomain?.fqdn" mono />
            <ReadonlyValue :label="t('field.serverIpv4')" :value="sendingDomain?.serverIpv4" mono />
            <ReadonlyValue :label="t('field.serverIpv6')" :value="sendingDomain?.serverIpv6" mono />
        </div>
        <template v-if="canUpdate" #footer>
            <SaveFooter
                v-if="mode === 'settings'"
                :form="formId"
                :dirty="meta.dirty"
                :pending="isPending"
                @discard="discard"
            />
            <VBtn
                v-else
                variant="flat"
                color="primary"
                type="submit"
                :form="formId"
                :text="t('module.setup.domain.submit')"
                :loading="isPending"
            />
        </template>
    </SectionCard>
</template>

<script lang="ts" setup>
    import { ref, useId, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { parse } from 'tldts'
    import { useI18n } from 'vue-i18n'
    import type { SendingDomainDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useSendingDomainMutation } from '@/modules/settings/mutations/useSendingDomainMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = withDefaults(
        defineProps<{
            sendingDomain?: SendingDomainDto | null
            mode?: 'settings' | 'setup'
            canUpdate?: boolean
        }>(),
        { sendingDomain: null, mode: 'settings', canUpdate: true },
    )

    const emit = defineEmits<{ saved: [sendingDomain: SendingDomainDto] }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const confirm = useConfirm()
    const notify = useNotify()
    const formId = useId()
    const { mutateAsync, isPending } = useSendingDomainMutation()
    const errorMessage = ref<string | null>(null)

    function initialValues(sendingDomain: SendingDomainDto | null) {
        return {
            fqdn: sendingDomain?.fqdn ?? '',
            serverIpv4: sendingDomain?.serverIpv4 ?? '',
            serverIpv6: sendingDomain?.serverIpv6 ?? '',
        }
    }

    const { defineField, handleSubmit, errors, meta, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                fqdn: z
                    .string()
                    .trim()
                    .min(1)
                    .refine((value) => !!parse(value).isIcann, { error: () => t('validation.hostname') }),
                serverIpv4: z.ipv4(),
                serverIpv6: z.ipv6().optional().or(z.literal('')),
            }),
        ),
        initialValues: initialValues(props.sendingDomain),
    })

    const [fqdn] = defineField('fqdn')
    const [serverIpv4] = defineField('serverIpv4')
    const [serverIpv6] = defineField('serverIpv6')

    useDirtyGuard(() => props.mode === 'settings' && meta.value.dirty)

    watch(
        () => props.sendingDomain,
        (sendingDomain) => {
            if (!meta.value.dirty) {
                resetForm({ values: initialValues(sendingDomain) })
            }
        },
    )

    function discard() {
        errorMessage.value = null
        resetForm({ values: initialValues(props.sendingDomain) })
    }

    async function confirmChange(values: { fqdn: string; serverIpv4: string; serverIpv6?: string }) {
        const current = props.sendingDomain
        if (props.mode !== 'settings' || !current) {
            return true
        }
        const changed =
            current.fqdn !== values.fqdn ||
            current.serverIpv4 !== values.serverIpv4 ||
            (current.serverIpv6 ?? '') !== (values.serverIpv6 ?? '')
        if (!changed) {
            return true
        }
        return confirm({
            title: t('module.settings.sendingDomain.confirm.title'),
            body: t('module.settings.sendingDomain.confirm.body', { fqdn: values.fqdn }),
            confirmLabel: t('module.settings.sendingDomain.confirm.action'),
        })
    }

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        if (!(await confirmChange(values))) {
            return
        }
        try {
            const sendingDomain = await mutateAsync({
                fqdn: values.fqdn,
                serverIpv4: values.serverIpv4,
                serverIpv6: values.serverIpv6 || undefined,
            })
            resetForm({ values: initialValues(sendingDomain) })
            if (props.mode === 'settings') {
                notify.success(t('module.settings.sendingDomain.saved'))
            }
            emit('saved', sendingDomain)
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    })
</script>
