<template>
    <VContainer>
        <VFadeTransition leave-absolute>
            <div v-if="!settings" class="d-flex justify-center">
                <VProgressCircular indeterminate size="128" class="mt-16" />
            </div>
            <div v-else>
                <h1>{{ t('module.settings.title') }}</h1>
                <VDivider class="mb-6" />
                <VCard class="mb-6">
                    <template #title>
                        <span class="text-body-large">{{ t('module.settings.sendingDomain.title') }}</span>
                    </template>
                    <VCardText>
                        <p class="text-body-large">{{ t('module.settings.sendingDomain.intro') }}</p>
                        <SendingDomainForm
                            :key="settings.sendingDomain?.fqdn ?? 'unconfigured'"
                            :sending-domain="settings.sendingDomain"
                        />
                    </VCardText>
                </VCard>
                <SendingDomainRecordsCard v-if="settings.sendingDomain" :sending-domain="settings.sendingDomain" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script lang="ts" setup>
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'
    import SendingDomainForm from '@/modules/settings/components/SendingDomainForm.vue'
    import SendingDomainRecordsCard from '@/modules/settings/components/SendingDomainRecordsCard.vue'

    const { t } = useI18n()
    const { data: settings } = useQuery(useSettingsQuery())
</script>
