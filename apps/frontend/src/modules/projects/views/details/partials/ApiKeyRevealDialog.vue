<template>
    <VDialog v-model="model" :max-width="440" :fullscreen="xs" :scrollable="false" persistent>
        <VCard v-if="apiKey" class="reveal-dialog" :class="{ 'reveal-dialog--fullscreen': xs }" :border="false">
            <header class="reveal-dialog__header">
                <h2 class="reveal-dialog__title">{{ t('module.projects.apiKeys.reveal.title') }}</h2>
            </header>
            <div class="reveal-dialog__body">
                <InlineAlert tone="warning" :text="t('module.projects.apiKeys.reveal.warning')" />
                <CopyField :value="apiKey.key" :label="t('module.projects.apiKeys.reveal.field')" />
                <i18n-t keypath="module.projects.apiKeys.reveal.usage" tag="p" class="reveal-dialog__hint">
                    <template #header>
                        <span class="mono">{{ authorizationHeader }}</span>
                    </template>
                    <template #endpoint>
                        <span class="mono">{{ sendEndpoint }}</span>
                    </template>
                </i18n-t>
            </div>
            <footer class="reveal-dialog__footer">
                <VBtn
                    variant="flat"
                    color="primary"
                    :text="t('module.projects.apiKeys.reveal.done')"
                    :block="xs"
                    @click="close"
                />
            </footer>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import type { ApiKeyCreatedDto } from 'api'
    import CopyField from '@/components/CopyField.vue'
    import InlineAlert from '@/components/InlineAlert.vue'

    defineProps<{ apiKey: ApiKeyCreatedDto | null }>()
    const model = defineModel<boolean>({ required: true })

    const authorizationHeader = 'Authorization: Bearer <key>'
    const sendEndpoint = 'POST /api/v1/send'

    const { t } = useI18n()
    const { xs } = useDisplay()

    function close() {
        model.value = false
    }
</script>

<style scoped>
    .reveal-dialog {
        display: flex;
        flex-direction: column;
        max-height: calc(100dvh - 48px);
        background: rgb(var(--v-theme-surface-overlay));
    }

    .reveal-dialog__header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 20px 16px 0 24px;
    }

    .reveal-dialog__title {
        flex: 1;
        margin: 4px 0 0;
        font-size: 1.25rem;
        font-weight: 600;
        line-height: 1.75rem;
    }

    .reveal-dialog__body {
        display: grid;
        align-content: start;
        gap: 20px;
        flex: 1 1 auto;
        min-height: 0;
        padding: 16px 24px 8px;
        overflow-y: auto;
    }

    .reveal-dialog__hint {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .reveal-dialog__footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 24px 20px;
    }

    .reveal-dialog--fullscreen {
        max-height: none;
        height: 100%;
        border-radius: 0;
    }

    .reveal-dialog--fullscreen .reveal-dialog__header {
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid rgb(var(--v-theme-border));
    }

    .reveal-dialog--fullscreen .reveal-dialog__title {
        margin: 0;
        font-size: 1rem;
        line-height: 1.5rem;
    }

    .reveal-dialog--fullscreen .reveal-dialog__body {
        padding: 16px;
    }

    .reveal-dialog--fullscreen .reveal-dialog__footer {
        padding: 12px 16px;
        border-top: 1px solid rgb(var(--v-theme-border));
    }
</style>
