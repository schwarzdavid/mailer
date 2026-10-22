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
            <ReadonlyValue class="span-2" :label="t('field.domain')" :value="fqdn" mono />
            <p class="span-2 sending-domain__hint">{{ t('module.settings.sendingDomain.domainHint') }}</p>
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
            <p v-if="!sendingDomain" class="span-2 sending-domain__hint">
                {{ t('module.settings.sendingDomain.addressHint', { fqdn: fqdn ?? '' }) }}
            </p>
        </form>
        <div v-else class="form-grid form-grid--2">
            <ReadonlyValue class="span-2" :label="t('field.domain')" :value="fqdn" mono />
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
    import { computed, ref, useId, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { SendingDomainDto, SendingDomainProposalDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useSendingDomainMutation } from '@/modules/settings/mutations/useSendingDomainMutation.ts'
    import { useSendingDomainProposalQuery } from '@/modules/settings/queries/useSendingDomainProposalQuery.ts'
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

    const { queryKey: proposalKey, queryFn: proposalFn } = useSendingDomainProposalQuery()
    const { data: proposal } = useQuery({
        queryKey: proposalKey,
        queryFn: proposalFn,
        enabled: computed(() => !props.sendingDomain),
    })

    const fqdn = computed(() => props.sendingDomain?.fqdn ?? proposal.value?.fqdn ?? null)

    function initialValues(sendingDomain: SendingDomainDto | null, fallback?: SendingDomainProposalDto) {
        const source = sendingDomain ?? fallback
        return {
            serverIpv4: source?.serverIpv4 ?? '',
            serverIpv6: source?.serverIpv6 ?? '',
        }
    }

    const { defineField, handleSubmit, errors, meta, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                serverIpv4: z.ipv4(),
                serverIpv6: z.ipv6().optional().or(z.literal('')),
            }),
        ),
        initialValues: initialValues(props.sendingDomain, proposal.value),
    })

    const [serverIpv4] = defineField('serverIpv4')
    const [serverIpv6] = defineField('serverIpv6')

    useDirtyGuard(() => props.mode === 'settings' && meta.value.dirty)

    watch([() => props.sendingDomain, proposal], ([sendingDomain, fallback]) => {
        if (!meta.value.dirty) {
            resetForm({ values: initialValues(sendingDomain, fallback) })
        }
    })

    function discard() {
        errorMessage.value = null
        resetForm({ values: initialValues(props.sendingDomain, proposal.value) })
    }

    async function confirmChange(values: { serverIpv4: string; serverIpv6?: string }) {
        const current = props.sendingDomain
        if (props.mode !== 'settings' || !current) {
            return true
        }
        const changed =
            current.serverIpv4 !== values.serverIpv4 || (current.serverIpv6 ?? '') !== (values.serverIpv6 ?? '')
        if (!changed) {
            return true
        }
        return confirm({
            title: t('module.settings.sendingDomain.confirm.title'),
            body: t('module.settings.sendingDomain.confirm.body', { fqdn: current.fqdn }),
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

<style scoped>
    .sending-domain__hint {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }
</style>
