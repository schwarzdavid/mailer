<template>
    <div class="snippet-step">
        <p class="snippet-step__label">{{ label }}</p>
        <CopyField :value="value" :label="label" />
    </div>
</template>

<script setup lang="ts">
    import CopyField from '@/components/CopyField.vue'

    defineProps<{ label: string; value: string }>()
</script>

<style scoped>
    .snippet-step {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .snippet-step__label {
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 500;
        color: rgb(var(--v-theme-ink-muted));
    }
</style>
