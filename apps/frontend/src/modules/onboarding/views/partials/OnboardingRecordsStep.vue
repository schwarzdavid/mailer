<template>
    <div class="page-stack">
        <SendingDomainRecordsCard :sending-domain="sendingDomain" :title="sendingDomain.fqdn" />
        <div class="setup-finish">
            <p class="setup-finish__text">
                {{ t('module.setup.records.summary', { valid: validCount, total: sendingDomain.records.length }) }}
                <template v-if="validCount < sendingDomain.records.length">{{
                    t('module.setup.records.canFinish')
                }}</template>
            </p>
            <InlineAlert
                v-if="errorMessage"
                tone="error"
                :title="t('module.setup.records.finishFailed')"
                :text="errorMessage"
            />
            <div class="setup-finish__actions">
                <VBtn variant="text" :text="t('cta.back')" @click="emit('back')" />
                <VBtn
                    variant="flat"
                    color="primary"
                    :text="t('module.setup.records.finish')"
                    :loading="isPending"
                    @click="finish"
                />
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { SendingDomainDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useFinishSetupMutation } from '@/modules/onboarding/mutations/useFinishSetupMutation.ts'
    import SendingDomainRecordsCard from '@/modules/settings/components/SendingDomainRecordsCard.vue'

    const props = defineProps<{ sendingDomain: SendingDomainDto }>()
    const emit = defineEmits<{ back: []; completed: [] }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useFinishSetupMutation()
    const errorMessage = ref<string | null>(null)

    const validCount = computed(() => props.sendingDomain.records.filter((record) => record.status === 'valid').length)

    async function finish() {
        errorMessage.value = null
        try {
            await mutateAsync()
            emit('completed')
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    }
</script>

<style scoped>
    .setup-finish {
        display: grid;
        gap: 16px;
    }

    .setup-finish__text {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
    }

    .setup-finish__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
</style>
