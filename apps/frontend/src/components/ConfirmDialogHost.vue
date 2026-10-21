<template>
    <VDialog :model-value="!!pending" max-width="440" @update:model-value="cancel">
        <VCard v-if="current" class="confirm-dialog" :border="false">
            <div class="confirm-dialog__body">
                <h2 class="confirm-dialog__title">{{ current.title }}</h2>
                <InlineAlert
                    v-if="error"
                    tone="error"
                    :title="current.errorText ?? t('dialog.actionFailed')"
                    :text="error"
                />
                <p v-if="current.body" class="confirm-dialog__text">{{ current.body }}</p>
            </div>
            <footer class="confirm-dialog__footer">
                <VBtn
                    ref="cancelButton"
                    variant="text"
                    :text="current.cancelLabel ?? t('cta.cancel')"
                    :disabled="running"
                    @click="cancel"
                />
                <VBtn
                    ref="confirmButton"
                    variant="flat"
                    :color="current.destructive ? 'error' : 'primary'"
                    :text="current.confirmLabel"
                    :loading="running"
                    @click="accept"
                />
            </footer>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
    import { useI18n } from 'vue-i18n'
    import InlineAlert from '@/components/InlineAlert.vue'
    import { useConfirmHost } from '@/composables/useConfirm.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const { t } = useI18n()
    const { pending, settle } = useConfirmHost()
    const running = ref(false)
    const error = ref<string | null>(null)
    const cancelButton = useTemplateRef<{ $el: HTMLElement }>('cancelButton')
    const confirmButton = useTemplateRef<{ $el: HTMLElement }>('confirmButton')

    const current = computed(() => pending.value?.options)

    watch(pending, async (value) => {
        error.value = null
        running.value = false
        if (!value) {
            return
        }
        await nextTick()
        setTimeout(() => {
            const target = value.options.destructive ? cancelButton.value : confirmButton.value
            target?.$el.focus()
        }, 50)
    })

    function cancel() {
        if (!running.value) {
            settle(false)
        }
    }

    async function accept() {
        const action = current.value?.action
        if (!action) {
            settle(true)
            return
        }
        running.value = true
        error.value = null
        try {
            await action()
            settle(true)
        } catch (caught) {
            error.value = apiErrorMessage(caught, t('dialog.tryAgain'))
        } finally {
            running.value = false
        }
    }
</script>

<style scoped>
    .confirm-dialog {
        background: rgb(var(--v-theme-surface-overlay));
    }

    .confirm-dialog__body {
        display: grid;
        gap: 16px;
        padding: 24px 24px 8px;
    }

    .confirm-dialog__title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        line-height: 1.75rem;
        overflow-wrap: anywhere;
    }

    .confirm-dialog__text {
        margin: 0;
        color: rgb(var(--v-theme-ink));
    }

    .confirm-dialog__footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 24px 20px;
    }
</style>
