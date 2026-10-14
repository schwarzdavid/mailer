<template>
    <dl class="readonly-value">
        <dt>{{ label }}</dt>
        <dd :class="{ mono }">
            <slot>{{ value || '—' }}</slot>
        </dd>
    </dl>
</template>

<script setup lang="ts">
    withDefaults(defineProps<{ label: string; value?: string | null; mono?: boolean }>(), {
        value: undefined,
        mono: false,
    })
</script>

<style scoped>
    .readonly-value {
        display: grid;
        gap: 2px;
        min-width: 0;
        margin: 0;
    }

    .readonly-value dt {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
    }

    .readonly-value dd {
        margin: 0;
        color: rgb(var(--v-theme-ink));
        overflow-wrap: anywhere;
    }

    .readonly-value dd.mono {
        font-size: 0.8125rem;
    }
</style>
