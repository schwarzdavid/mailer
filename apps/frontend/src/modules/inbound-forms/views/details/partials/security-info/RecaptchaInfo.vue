<template>
    <div class="security-info">
        <p>{{ t('module.inboundForms.details.security.info.google-recaptcha.intro') }}</p>
        <SnippetStep :label="t('module.inboundForms.details.security.info.steps.import')" :value="importTag" />
        <SnippetStep :label="t('module.inboundForms.details.security.info.steps.token')" :value="token" />
        <SnippetStep :label="t('module.inboundForms.details.security.info.steps.send')" :value="send" />
        <p>{{ t('module.inboundForms.details.security.info.google-recaptcha.note') }}</p>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, InboundFormSecurityDto } from 'api'
    import { formEndpointUrl } from '@/modules/inbound-forms/helpers/formEndpointUrl.ts'
    import { scriptTag, securityPlacement } from '@/modules/inbound-forms/helpers/integrationSnippets.ts'
    import SnippetStep from '@/modules/inbound-forms/views/details/partials/security-info/SnippetStep.vue'

    const props = defineProps<{ scheme: InboundFormSecurityDto; form: InboundFormDetailDto }>()

    const { t } = useI18n()

    const importTag = scriptTag('https://www.google.com/recaptcha/api.js?render=SITE_KEY')
    const token = computed(() => {
        const action = props.scheme.config?.expectedAction || 'submit'
        return `const token = await grecaptcha.execute('SITE_KEY', { action: '${action}' })`
    })
    const send = computed(() => securityPlacement(formEndpointUrl(props.form.slug), props.scheme, 'token'))
</script>

<style scoped>
    .security-info {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .security-info p {
        margin: 0;
    }
</style>
