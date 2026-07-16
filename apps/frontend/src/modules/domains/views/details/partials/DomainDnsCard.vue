<template>
    <VCard prepend-icon="mdi-magnify-scan">
        <template #title>
            <span class="text-body-large">{{ t('module.domains.dns.title') }}</span>
        </template>
        <template #append>
            <span class="d-block pe-4 text-medium-emphasis" v-if="domain.lastCheckedAt">{{
                t('module.domains.dns.lastChecked', { date: lastCheckedDate })
            }}</span>
            <VBtn
                prepend-icon="mdi-refresh"
                size="default"
                :text="t('cta.refresh')"
                @click="mutateAsync(domain.domainId)"
                :loading="isPending"
            />
        </template>
        <VCardText>
            <p class="text-body-large">{{ t('module.domains.dns.intro') }}</p>
            <strong>{{ t('module.domains.dns.spf.title') }}</strong>
            <p class="mt-0">{{ t('module.domains.dns.spf.description') }}</p>
            <DomainDnsRecord :record="domain.dns.spf" />
            <VDivider class="my-4" />
            <strong>{{ t('module.domains.dns.dkim.title') }}</strong>
            <p class="mt-0">{{ t('module.domains.dns.dkim.description') }}</p>
            <DomainDnsRecord :record="domain.dns.dkim" />
            <VDivider class="my-4" />
            <strong>{{ t('module.domains.dns.dmarc.title') }}</strong>
            <p class="mt-0">{{ t('module.domains.dns.dmarc.description') }}</p>
            <DomainDnsRecord :record="domain.dns.dmarc" />
        </VCardText>
    </VCard>
</template>

<script lang="ts" setup>
    import type { DomainDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import DomainDnsRecord from '@/modules/domains/components/DomainDnsRecord.vue'
    import { useDomainRefreshMutation } from '@/modules/domains/mutations/useDomainRefreshMutation.ts'
    import { useDateFormat } from '@vueuse/core'

    const props = defineProps<{
        domain: DomainDto
    }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useDomainRefreshMutation()

    const lastCheckedDate = useDateFormat(() => props.domain.lastCheckedAt!, 'DD.MM.YYYY HH:mm:ss')
</script>
