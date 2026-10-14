<template>
    <VSnackbar
        v-if="current"
        :key="current.id"
        :model-value="true"
        :timeout="current.timeout"
        :max-width="560"
        :width="xs ? 'calc(100% - 16px)' : undefined"
        class="notification"
        content-class="notification__content"
        @update:model-value="onClose"
    >
        <div class="notification__row" :role="current.kind === 'error' ? 'alert' : 'status'">
            <VIcon v-if="icon" :icon="icon" size="20" class="notification__icon" />
            <span class="notification__message">
                {{ current.text }}
                <span v-if="current.detail" class="notification__detail">{{ current.detail }}</span>
            </span>
            <button v-if="current.kind === 'undo'" type="button" class="notification__action" @click="undo">
                {{ t('notify.undo') }}
            </button>
            <button v-if="current.retry" type="button" class="notification__action" @click="retry">
                {{ t('notify.retry') }}
            </button>
            <RouterLink v-if="current.link" :to="current.link.to" class="notification__action" @click="dismiss">
                {{ current.link.label }}
            </RouterLink>
            <button type="button" class="notification__close" :aria-label="t('notify.dismiss')" @click="dismiss">
                <VIcon :icon="mdiClose" size="20" />
            </button>
        </div>
        <span
            v-if="current.kind === 'undo'"
            class="notification__timer"
            :style="{ animationDuration: `${current.timeout}ms` }"
        />
    </VSnackbar>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useRoute } from 'vue-router'
    import { useDisplay } from 'vuetify'
    import { mdiAlertCircleOutline, mdiCheckCircleOutline, mdiClose } from '@mdi/js'
    import { useNotificationHost } from '@/composables/useNotify.ts'

    const { t } = useI18n()
    const { xs } = useDisplay()
    const route = useRoute()
    const { current, dismiss, undo, retry } = useNotificationHost()

    const icon = computed(() => {
        switch (current.value?.kind) {
            case 'success':
                return mdiCheckCircleOutline
            case 'error':
                return mdiAlertCircleOutline
            default:
                return undefined
        }
    })

    watch(
        () => route.path,
        () => {
            if (current.value?.kind === 'undo') {
                dismiss()
            }
        },
    )

    function onClose(open: boolean) {
        if (!open) {
            dismiss()
        }
    }
</script>

<style scoped>
    .notification :deep(.notification__content) {
        position: relative;
        padding: 0;
        border-radius: 10px;
        background: rgb(var(--v-theme-surface-inverse));
        color: rgb(var(--v-theme-on-surface-inverse));
        box-shadow: var(--v-shadow-lg);
    }

    .notification :deep(.v-snackbar__content) {
        padding: 0;
    }

    .notification__row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 48px;
        padding: 6px 6px 6px 16px;
    }

    .notification__message {
        flex: 1;
        min-width: 0;
        padding: 8px 0;
    }

    .notification__detail {
        display: block;
        opacity: 0.8;
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .notification__action {
        height: 36px;
        padding: 0 12px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: rgb(var(--v-theme-inverse-primary));
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 36px;
        text-decoration: none;
        white-space: nowrap;
        cursor: pointer;
    }

    .notification__action:hover,
    .notification__close:hover {
        background: rgba(127, 127, 127, 0.18);
    }

    .notification__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: rgb(var(--v-theme-on-surface-inverse));
        cursor: pointer;
    }

    .notification__timer {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 0;
        height: 2px;
        border-radius: 2px;
        background: rgb(var(--v-theme-inverse-primary));
        transform-origin: left;
        animation-name: notification-countdown;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
    }

    @keyframes notification-countdown {
        from {
            transform: scaleX(1);
        }

        to {
            transform: scaleX(0);
        }
    }
</style>
