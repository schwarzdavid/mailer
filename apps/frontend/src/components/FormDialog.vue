<template>
    <VDialog
        :model-value="modelValue"
        :max-width="maxWidth"
        :fullscreen="xs"
        :scrollable="false"
        persistent
        @update:model-value="onDialogUpdate"
    >
        <VCard class="form-dialog" :class="{ 'form-dialog--fullscreen': xs }" :border="false">
            <form
                class="form-dialog__form"
                novalidate
                @submit.prevent="onSubmit"
                @keydown.esc.stop.prevent="requestClose"
            >
                <header class="form-dialog__header">
                    <IconButton
                        v-if="xs"
                        :icon="mdiClose"
                        :label="t('dialog.close')"
                        :disabled="pending"
                        @click="requestClose"
                    />
                    <h2 class="form-dialog__title">{{ title }}</h2>
                    <IconButton
                        v-if="!xs"
                        :icon="mdiClose"
                        :label="t('dialog.close')"
                        :disabled="pending"
                        @click="requestClose"
                    />
                </header>
                <div ref="body" class="form-dialog__body">
                    <InlineAlert
                        v-if="error"
                        tone="error"
                        :title="errorTitle ?? t('dialog.saveFailed')"
                        :text="error"
                    />
                    <slot />
                </div>
                <footer class="form-dialog__footer">
                    <slot name="footer-start" />
                    <VBtn variant="text" :text="t('cta.cancel')" :disabled="pending" @click="requestClose" />
                    <VBtn
                        variant="flat"
                        :color="destructive ? 'error' : 'primary'"
                        type="submit"
                        :text="submitLabel"
                        :loading="pending"
                        :block="xs"
                        class="form-dialog__submit"
                    />
                </footer>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, nextTick, useTemplateRef, watch } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import { mdiClose } from '@mdi/js'
    import IconButton from '@/components/IconButton.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import { useDiscardConfirm } from '@/composables/useDirtyGuard.ts'

    const props = withDefaults(
        defineProps<{
            modelValue: boolean
            title: string
            submitLabel: string
            width?: 'sm' | 'md' | 'lg'
            pending?: boolean
            error?: string | null
            errorTitle?: string
            dirty?: boolean
            destructive?: boolean
        }>(),
        { width: 'md', pending: false, error: null, errorTitle: undefined, dirty: false, destructive: false },
    )

    const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [] }>()

    const { t } = useI18n()
    const { xs } = useDisplay()
    const confirmDiscard = useDiscardConfirm()
    const body = useTemplateRef('body')

    const maxWidth = computed(() => ({ sm: 440, md: 560, lg: 720 })[props.width])

    watch(
        () => props.modelValue,
        async (open) => {
            if (!open) {
                return
            }
            await nextTick()
            setTimeout(() => {
                const active = document.activeElement
                if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
                    return
                }
                body.value?.querySelector<HTMLElement>('input:not([type=hidden]), textarea')?.focus()
            }, 50)
        },
    )

    function onSubmit() {
        if (!props.pending) {
            emit('submit')
        }
    }

    function onDialogUpdate(value: boolean) {
        if (!value) {
            void requestClose()
        }
    }

    async function requestClose() {
        if (props.pending) {
            return
        }
        if (props.dirty && !(await confirmDiscard())) {
            return
        }
        emit('update:modelValue', false)
    }
</script>

<style scoped>
    .form-dialog {
        display: flex;
        flex-direction: column;
        max-height: calc(100dvh - 48px);
        background: rgb(var(--v-theme-surface-overlay));
    }

    .form-dialog__form {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
    }

    .form-dialog__header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 20px 16px 0 24px;
    }

    .form-dialog__title {
        flex: 1;
        margin: 4px 0 0;
        font-size: 1.25rem;
        font-weight: 600;
        line-height: 1.75rem;
    }

    .form-dialog__body {
        display: grid;
        align-content: start;
        gap: 20px;
        flex: 1 1 auto;
        min-height: 0;
        padding: 16px 24px 8px;
        overflow-y: auto;
    }

    .form-dialog__body :deep(p) {
        margin: 0;
    }

    .form-dialog__footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 24px 20px;
    }

    .form-dialog--fullscreen {
        max-height: none;
        height: 100%;
        border-radius: 0;
    }

    .form-dialog--fullscreen .form-dialog__header {
        align-items: center;
        padding: 8px 8px 8px 8px;
        border-bottom: 1px solid rgb(var(--v-theme-border));
    }

    .form-dialog--fullscreen .form-dialog__title {
        margin: 0;
        font-size: 1rem;
        line-height: 1.5rem;
    }

    .form-dialog--fullscreen .form-dialog__body {
        padding: 16px;
    }

    .form-dialog--fullscreen .form-dialog__footer {
        padding: 12px 16px;
        border-top: 1px solid rgb(var(--v-theme-border));
    }

    .form-dialog--fullscreen .form-dialog__footer > .v-btn--variant-text {
        display: none;
    }
</style>
