<template>
    <div>
        <p class="mb-6">{{ t('module.onboarding.steps.records.intro') }}</p>
        <SendingDomainRecordsCard v-if="sendingDomain" :sending-domain="sendingDomain" />
        <div class="d-flex justify-end mt-6">
            <VBtn :text="t('cta.finish')" @click="emit('completed')" />
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'
    import SendingDomainRecordsCard from '@/modules/settings/components/SendingDomainRecordsCard.vue'

    const emit = defineEmits<{
        completed: []
    }>()

    const { t } = useI18n()
    const { data: settings } = useQuery(useSettingsQuery())

    const sendingDomain = computed(() => settings.value?.sendingDomain ?? null)
</script>
