<template>
    <span class="count-pill">{{ formatted }}</span>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'

    const props = defineProps<{ value: number }>()
    const { n } = useI18n()
    const formatted = computed(() => n(props.value))
</script>

<style scoped>
    .count-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 9999px;
        background: rgb(var(--v-theme-surface-sunken));
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
        font-variant-numeric: tabular-nums;
    }
</style>
