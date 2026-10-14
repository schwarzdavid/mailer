<template>
    <span class="status-badge" :class="[`status-badge--${tone}`, { 'status-badge--lg': large }]">
        <span class="status-badge__dot" aria-hidden="true" />
        <slot>{{ label }}</slot>
    </span>
</template>

<script setup lang="ts">
    import type { StatusTone } from '@/components/statusTone.ts'

    withDefaults(defineProps<{ tone: StatusTone; label?: string; large?: boolean }>(), {
        label: undefined,
        large: false,
    })
</script>

<style scoped>
    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex: none;
        height: 22px;
        padding: 0 9px 0 8px;
        border: 1px solid rgb(var(--v-theme-border));
        border-radius: 9999px;
        color: rgb(var(--v-theme-ink));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
        white-space: nowrap;
    }

    .status-badge__dot {
        flex: none;
        width: 6px;
        height: 6px;
        border-radius: 9999px;
        background: rgb(var(--v-theme-ink-muted));
    }

    .status-badge--success .status-badge__dot {
        background: rgb(var(--v-theme-success));
    }

    .status-badge--warning .status-badge__dot {
        background: rgb(var(--v-theme-warning));
    }

    .status-badge--error .status-badge__dot {
        background: rgb(var(--v-theme-error));
    }

    .status-badge--info .status-badge__dot {
        background: rgb(var(--v-theme-info));
    }

    .status-badge--neutral,
    .status-badge--pending {
        color: rgb(var(--v-theme-ink-muted));
    }

    .status-badge--neutral .status-badge__dot {
        background: transparent;
        box-shadow: inset 0 0 0 1.5px rgb(var(--v-theme-ink-muted));
    }

    .status-badge--pending .status-badge__dot {
        width: 8px;
        height: 8px;
        margin: 0 -1px;
        background: transparent;
        border: 1.5px solid currentColor;
        border-right-color: transparent;
        animation: status-badge-spin 0.75s linear infinite;
    }

    .status-badge--lg {
        height: 26px;
        padding: 0 11px 0 10px;
        font-size: 0.8125rem;
    }

    @keyframes status-badge-spin {
        to {
            transform: rotate(360deg);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .status-badge--pending .status-badge__dot {
            animation-duration: 3s;
        }
    }
</style>
