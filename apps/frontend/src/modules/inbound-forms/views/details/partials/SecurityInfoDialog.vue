<template>
    <FormDialog v-model="model" :title="title" :submit-label="t('dialog.close')" :submittable="false" width="lg">
        <component :is="infoComponents[scheme.type]" v-if="scheme" :scheme="scheme" :form="form" />
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, type Component } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, InboundFormSecurityDto } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import HoneypotInfo from '@/modules/inbound-forms/views/details/partials/security-info/HoneypotInfo.vue'
    import RecaptchaInfo from '@/modules/inbound-forms/views/details/partials/security-info/RecaptchaInfo.vue'
    import TimedTokenInfo from '@/modules/inbound-forms/views/details/partials/security-info/TimedTokenInfo.vue'

    const props = defineProps<{ scheme: InboundFormSecurityDto | null; form: InboundFormDetailDto }>()
    const model = defineModel<boolean>({ required: true })

    const { t } = useI18n()

    const infoComponents: Record<InboundFormSecurityDto['type'], Component> = {
        honeypot: HoneypotInfo,
        'google-recaptcha': RecaptchaInfo,
        'timed-token': TimedTokenInfo,
    }

    const title = computed(() =>
        props.scheme
            ? t('module.inboundForms.details.security.info.title', {
                  type: t(`module.inboundForms.details.security.typeOptions.${props.scheme.type}`),
              })
            : '',
    )
</script>
