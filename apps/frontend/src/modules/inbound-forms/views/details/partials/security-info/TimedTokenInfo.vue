<template>
    <div class="security-info">
        <p>{{ t('module.inboundForms.details.security.info.timed-token.intro') }}</p>
        <SnippetStep :label="t('module.inboundForms.details.security.info.steps.install')" :value="install" />
        <SnippetStep :label="t('module.inboundForms.details.security.info.steps.prepare')" :value="prepare" />
        <SnippetStep :label="t('module.inboundForms.details.security.info.steps.send')" :value="send" />
        <SnippetStep
            :label="t('module.inboundForms.details.security.info.steps.withoutBundler')"
            :value="withoutBundler"
        />
        <p>{{ t('module.inboundForms.details.security.info.timed-token.note') }}</p>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, InboundFormSecurityDto } from 'api'
    import { formBaseUrl, formClientScriptUrl } from '@/modules/inbound-forms/helpers/formEndpointUrl.ts'
    import {
        clientImport,
        formConstruction,
        inlineScript,
        installCommand,
        scriptTag,
        scriptTagConstruction,
    } from '@/modules/inbound-forms/helpers/integrationSnippets.ts'
    import SnippetStep from '@/modules/inbound-forms/views/details/partials/security-info/SnippetStep.vue'

    const props = defineProps<{ scheme: InboundFormSecurityDto; form: InboundFormDetailDto }>()

    const { t } = useI18n()

    const install = `${installCommand()}\n${clientImport()}`
    const prepare = computed(
        () =>
            `${formConstruction(formBaseUrl(), props.form.formKey, props.scheme)}\n\nformElement.addEventListener('focusin', () => form.prepare())`,
    )
    const send = 'await form.submit({ data })'
    const withoutBundler = computed(
        () =>
            `${scriptTag(formClientScriptUrl())}\n${inlineScript(scriptTagConstruction(props.form.formKey, props.scheme))}`,
    )
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
