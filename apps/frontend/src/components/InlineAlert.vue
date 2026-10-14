<template>
    <div class="inline-alert" :class="`inline-alert--${tone}`" :role="tone === 'error' ? 'alert' : 'note'">
        <VIcon class="inline-alert__icon" :icon="icon" size="20" />
        <div class="inline-alert__body">
            <div v-if="title" class="inline-alert__title">{{ title }}</div>
            <div v-if="text || $slots.default" class="inline-alert__text">
                <slot>{{ text }}</slot>
            </div>
            <div v-if="$slots.actions" class="inline-alert__actions">
                <slot name="actions" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { mdiAlertCircleOutline, mdiAlertOutline, mdiCheckCircleOutline, mdiInformationOutline } from '@mdi/js'

    const props = withDefaults(
        defineProps<{ tone: 'info' | 'success' | 'warning' | 'error'; title?: string; text?: string }>(),
        { title: undefined, text: undefined },
    )

    const icons = {
        info: mdiInformationOutline,
        success: mdiCheckCircleOutline,
        warning: mdiAlertOutline,
        error: mdiAlertCircleOutline,
    }

    const icon = computed(() => icons[props.tone])
</script>

<style scoped>
    .inline-alert {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 6px;
        color: rgb(var(--v-theme-ink));
    }

    .inline-alert__body {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: 2px;
    }

    .inline-alert__title {
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }

    .inline-alert__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
    }

    .inline-alert :deep(a) {
        color: inherit;
        font-weight: 500;
    }

    .inline-alert--info {
        background: rgb(var(--v-theme-info-container));
    }

    .inline-alert--info .inline-alert__icon,
    .inline-alert--info .inline-alert__title {
        color: rgb(var(--v-theme-info));
    }

    .inline-alert--success {
        background: rgb(var(--v-theme-success-container));
    }

    .inline-alert--success .inline-alert__icon,
    .inline-alert--success .inline-alert__title {
        color: rgb(var(--v-theme-success));
    }

    .inline-alert--warning {
        background: rgb(var(--v-theme-warning-container));
    }

    .inline-alert--warning .inline-alert__icon,
    .inline-alert--warning .inline-alert__title {
        color: rgb(var(--v-theme-warning));
    }

    .inline-alert--error {
        background: rgb(var(--v-theme-error-container));
    }

    .inline-alert--error .inline-alert__icon,
    .inline-alert--error .inline-alert__title {
        color: rgb(var(--v-theme-error));
    }
</style>
