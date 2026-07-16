<template>
    <div>
        <p class="mb-6">{{ t('module.onboarding.steps.domain.intro') }}</p>
        <SendingDomainForm :sending-domain="sendingDomain" @saved="emit('completed')" />
    </div>
</template>

<script lang="ts" setup>
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'
    import SendingDomainForm from '@/modules/settings/components/SendingDomainForm.vue'

    const emit = defineEmits<{
        completed: []
    }>()

    const { t } = useI18n()
    const { data: settings } = useQuery(useSettingsQuery())

    const sendingDomain = computed(() => settings.value?.sendingDomain ?? null)
</script>
