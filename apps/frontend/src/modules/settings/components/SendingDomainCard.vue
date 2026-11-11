<template>
    <SectionCard
        :title="t('module.settings.sendingDomain.title')"
        :description="t('module.settings.sendingDomain.description')"
    >
        <div class="form-grid form-grid--2">
            <ReadonlyValue class="span-2" :label="t('field.domain')" :value="sendingDomain.fqdn" mono />
            <ReadonlyValue :label="t('field.serverIpv4')" :value="sendingDomain.serverIpv4" mono />
            <ReadonlyValue :label="t('field.serverIpv6')" :value="sendingDomain.serverIpv6" mono />
            <p class="span-2 sending-domain__hint">{{ t('module.settings.sendingDomain.configurationHint') }}</p>
        </div>
    </SectionCard>
</template>

<script lang="ts" setup>
    import { useI18n } from 'vue-i18n'
    import type { SendingDomainDto } from 'api'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SectionCard from '@/components/SectionCard.vue'

    defineProps<{ sendingDomain: SendingDomainDto }>()

    const { t } = useI18n()
</script>

<style scoped>
    .sending-domain__hint {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }
</style>
