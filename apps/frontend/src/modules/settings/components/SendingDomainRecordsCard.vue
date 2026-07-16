<template>
    <VCard prepend-icon="mdi-magnify-scan">
        <template #title>
            <span class="text-body-large">{{ t('module.settings.sendingDomain.records.title') }}</span>
        </template>
        <template #append>
            <span class="d-block pe-4 text-medium-emphasis" v-if="sendingDomain.lastCheckedAt">{{
                t('module.settings.sendingDomain.records.lastChecked', { date: lastCheckedDate })
            }}</span>
            <VBtn
                prepend-icon="mdi-refresh"
                size="default"
                :text="t('cta.refresh')"
                @click="mutateAsync()"
                :loading="isPending"
            />
        </template>
        <VCardText>
            <p class="text-body-large">{{ t('module.settings.sendingDomain.records.intro') }}</p>
            <template v-for="(record, index) in orderedRecords" :key="`${record.use}-${record.host}`">
                <VDivider v-if="index > 0" class="my-4" />
                <strong>{{ t(`module.settings.sendingDomain.records.${record.use}.title`) }}</strong>
                <p class="mt-0">{{ t(`module.settings.sendingDomain.records.${record.use}.description`) }}</p>
                <DomainDnsRecord :record="record" />
            </template>
        </VCardText>
    </VCard>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useDateFormat } from '@vueuse/core'
    import type { SendingDomainDto } from 'api'
    import DomainDnsRecord from '@/modules/domains/components/DomainDnsRecord.vue'
    import { useSendingDomainRefreshMutation } from '@/modules/settings/mutations/useSendingDomainRefreshMutation.ts'

    const props = defineProps<{
        sendingDomain: SendingDomainDto
    }>()

    const RECORD_ORDER = ['a', 'aaaa', 'mx', 'spf', 'dkim', 'dmarc', 'ptr']

    const { t } = useI18n()
    const { mutateAsync, isPending } = useSendingDomainRefreshMutation()

    const orderedRecords = computed(() =>
        [...props.sendingDomain.records].sort(
            (left, right) => RECORD_ORDER.indexOf(left.use) - RECORD_ORDER.indexOf(right.use),
        ),
    )

    const lastCheckedDate = useDateFormat(() => props.sendingDomain.lastCheckedAt!, 'DD.MM.YYYY HH:mm:ss')
</script>
