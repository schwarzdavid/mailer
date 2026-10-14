<template>
    <span class="dns-meter" role="img" :aria-label="t('dns.summary', { valid, total: records.length })">
        <span v-for="(record, index) in records" :key="index" :class="{ 'dns-meter__ok': record.status === 'valid' }" />
    </span>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { DomainDnsRecordDto } from 'api'

    const props = defineProps<{ records: DomainDnsRecordDto[] }>()

    const { t } = useI18n()
    const valid = computed(() => props.records.filter((record) => record.status === 'valid').length)
</script>

<style scoped>
    .dns-meter {
        display: flex;
        gap: 3px;
        height: 6px;
        min-width: 80px;
    }

    .dns-meter span {
        flex: 1;
        border-radius: 2px;
        background: rgb(var(--v-theme-warning));
    }

    .dns-meter span.dns-meter__ok {
        background: rgb(var(--v-theme-success));
    }
</style>
