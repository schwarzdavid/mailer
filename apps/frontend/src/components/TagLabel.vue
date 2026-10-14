<template>
    <span class="tag-label" :class="{ 'tag-label--mono': mono }">
        <slot>{{ label }}</slot>
    </span>
</template>

<script setup lang="ts">
    withDefaults(defineProps<{ label?: string; mono?: boolean }>(), {
        label: undefined,
        mono: false,
    })
</script>

<style scoped>
    .tag-label {
        display: inline-flex;
        align-items: center;
        flex: none;
        height: 22px;
        padding: 0 7px;
        border-radius: 4px;
        background: rgb(var(--v-theme-surface-sunken));
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
        white-space: nowrap;
    }

    .tag-label--mono {
        font-family: var(--font-mono);
        font-weight: 400;
        font-variant-ligatures: none;
    }
</style>
