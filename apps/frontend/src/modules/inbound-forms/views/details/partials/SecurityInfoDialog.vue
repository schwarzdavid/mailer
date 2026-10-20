<template>
    <FormDialog v-model="model" :title="title" :submit-label="t('dialog.close')" :submittable="false" width="lg">
        <template v-if="scheme">
            <p>{{ t(`module.inboundForms.details.security.info.${scheme.type}.intro`) }}</p>
            <CopyField :value="snippet" :label="t('module.inboundForms.details.security.info.snippetLabel')" />
            <p>{{ t(`module.inboundForms.details.security.info.${scheme.type}.note`) }}</p>
        </template>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, InboundFormSecurityDto } from 'api'
    import CopyField from '@/components/CopyField.vue'
    import FormDialog from '@/components/FormDialog.vue'
    import { formClientScriptUrl, formEndpointUrl } from '@/modules/inbound-forms/helpers/formEndpointUrl.ts'
    import {
        honeypotSnippet,
        recaptchaSnippet,
        timedTokenSnippet,
    } from '@/modules/inbound-forms/helpers/integrationSnippets.ts'

    const props = defineProps<{ scheme: InboundFormSecurityDto | null; form: InboundFormDetailDto }>()
    const model = defineModel<boolean>({ required: true })

    const { t } = useI18n()

    const title = computed(() =>
        props.scheme
            ? t('module.inboundForms.details.security.info.title', {
                  type: t(`module.inboundForms.details.security.typeOptions.${props.scheme.type}`),
              })
            : '',
    )

    const snippet = computed(() => {
        const scheme = props.scheme
        if (!scheme) {
            return ''
        }
        const endpoint = formEndpointUrl(props.form.slug)
        if (scheme.type === 'honeypot') {
            return honeypotSnippet(endpoint, props.form.slug, scheme)
        }
        if (scheme.type === 'google-recaptcha') {
            return recaptchaSnippet(endpoint, props.form.slug, scheme)
        }
        return timedTokenSnippet(endpoint, formClientScriptUrl(), props.form.slug, scheme)
    })
</script>
