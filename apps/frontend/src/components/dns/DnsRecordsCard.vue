<template>
    <SectionCard :title="title ?? t('dns.title')" :description="description ?? t('dns.instruction')" flush>
        <template v-if="canCheck" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiRefresh"
                :text="t('dns.checkAgain')"
                :loading="checking"
                @click="emit('check')"
            />
        </template>
        <div class="dns-records__summary">
            <slot name="alert" />
            <div class="dns-records__meter-row">
                <DnsMeter class="dns-records__meter" :records="records" />
                <span class="dns-records__count">{{
                    t('dns.summary', { valid: validCount, total: records.length })
                }}</span>
                <span v-if="checkedAt" class="dns-records__checked">
                    <i18n-t keypath="dns.checkedAt" tag="span">
                        <template #time><RelativeTime :value="checkedAt" /></template>
                    </i18n-t>
                </span>
                <span v-else class="dns-records__checked">{{ t('dns.neverChecked') }}</span>
            </div>
        </div>
        <DnsRecord
            v-for="record in records"
            :key="`${record.use}-${record.host}`"
            :record="record"
            :checking="checking"
        />
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { mdiRefresh } from '@mdi/js'
    import type { DomainDnsRecordDto } from 'api'
    import SectionCard from '@/components/SectionCard.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import DnsMeter from '@/components/dns/DnsMeter.vue'
    import DnsRecord from '@/components/dns/DnsRecord.vue'

    const props = withDefaults(
        defineProps<{
            records: DomainDnsRecordDto[]
            checkedAt?: Date | string | null
            checking?: boolean
            canCheck?: boolean
            title?: string
            description?: string
        }>(),
        { checkedAt: null, checking: false, canCheck: true, title: undefined, description: undefined },
    )

    const emit = defineEmits<{ check: [] }>()
    const { t } = useI18n()

    const validCount = computed(() => props.records.filter((record) => record.status === 'valid').length)
</script>

<style scoped>
    .dns-records__summary {
        display: grid;
        gap: 16px;
        padding: 4px 24px 12px;
        border-bottom: 1px solid rgb(var(--v-theme-border));
    }

    .dns-records__meter-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
    }

    .dns-records__meter {
        flex: 1 1 120px;
        max-width: 200px;
    }

    .dns-records__count {
        font-weight: 500;
    }

    .dns-records__checked {
        color: rgb(var(--v-theme-ink-muted));
    }

    @media (max-width: 599.98px) {
        .dns-records__summary {
            padding: 4px 16px 12px;
        }
    }
</style>
