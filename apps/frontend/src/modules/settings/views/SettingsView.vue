<template>
    <PageHeader :title="t('module.settings.title')" :description="t('module.settings.description')" />

    <ErrorState
        v-if="isError"
        size="page"
        :thing="t('module.settings.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    />
    <div v-else-if="isPending" class="page-stack">
        <PageSkeleton :label="t('module.settings.loading')" />
        <SectionCard :title="t('dns.title')" flush>
            <DnsRecordSkeleton />
        </SectionCard>
    </div>
    <div v-else-if="settings" class="page-stack">
        <SendingDomainCard :sending-domain="settings.sendingDomain" :can-update="canUpdate" />
        <SendingDomainRecordsCard
            v-if="settings.sendingDomain"
            :sending-domain="settings.sendingDomain"
            :can-check="canUpdate"
        />
    </div>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import ErrorState from '@/components/ErrorState.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import DnsRecordSkeleton from '@/components/skeletons/DnsRecordSkeleton.vue'
    import PageSkeleton from '@/components/skeletons/PageSkeleton.vue'
    import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'
    import SendingDomainCard from '@/modules/settings/components/SendingDomainCard.vue'
    import SendingDomainRecordsCard from '@/modules/settings/components/SendingDomainRecordsCard.vue'

    const { t } = useI18n()
    const userAbility = useAbility()
    const { data: settings, isPending, isError, error, isFetching, refetch } = useQuery(useSettingsQuery())

    const canUpdate = computed(() => userAbility.can('update', 'Settings'))
</script>
