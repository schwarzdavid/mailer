<template>
    <DnsRecordsCard
        :records="sendingDomain.records"
        :checked-at="sendingDomain.lastCheckedAt"
        :checking="isPending"
        :can-check="canCheck"
        :title="title"
        :description="t('module.settings.records.instruction')"
        @check="check"
    >
        <template v-if="allValid" #alert>
            <InlineAlert
                tone="success"
                :title="t('module.settings.records.allValid.title', { count: sendingDomain.records.length })"
                :text="t('module.settings.records.allValid.text', { fqdn: sendingDomain.fqdn })"
            />
        </template>
    </DnsRecordsCard>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { SendingDomainDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import DnsRecordsCard from '@/components/dns/DnsRecordsCard.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useSendingDomainRefreshMutation } from '@/modules/settings/mutations/useSendingDomainRefreshMutation.ts'

    const props = withDefaults(defineProps<{ sendingDomain: SendingDomainDto; canCheck?: boolean; title?: string }>(), {
        canCheck: true,
        title: undefined,
    })

    const { t } = useI18n()
    const notify = useNotify()
    const { mutateAsync, isPending } = useSendingDomainRefreshMutation()

    const allValid = computed(() => props.sendingDomain.records.every((record) => record.status === 'valid'))

    async function check() {
        const before = props.sendingDomain.records.filter((record) => record.status === 'valid').length
        try {
            const result = await mutateAsync()
            const after = result.records.filter((record) => record.status === 'valid').length
            if (after === before && after < result.records.length) {
                notify.info(t('module.settings.records.unchanged'))
            }
        } catch {
            notify.error(t('module.settings.records.checkFailed', { fqdn: props.sendingDomain.fqdn }), {
                retry: () => void check(),
            })
        }
    }
</script>
