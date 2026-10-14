<template>
    <span class="status-dot" :class="`status-dot--${tone}`" />
</template>

<script setup lang="ts">
    defineProps<{ tone: 'success' | 'warning' | 'error' | 'neutral' }>()
</script>

<style scoped>
    .status-dot {
        display: inline-block;
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: rgb(var(--v-theme-ink-muted));
    }

    .status-dot--success {
        background: rgb(var(--v-theme-success));
    }

    .status-dot--warning {
        background: rgb(var(--v-theme-warning));
    }

    .status-dot--error {
        background: rgb(var(--v-theme-error));
    }
</style>
