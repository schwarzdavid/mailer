<template>
    <details class="disclosure-box" :open="open" @toggle="onToggle">
        <summary>
            <VIcon :icon="mdiChevronRight" size="18" class="disclosure-box__chevron" aria-hidden="true" />
            {{ summary }}
        </summary>
        <div class="disclosure-box__content">
            <slot />
        </div>
    </details>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { mdiChevronRight } from '@mdi/js'

    defineProps<{ summary: string }>()

    const open = ref(false)

    function onToggle(event: Event) {
        open.value = (event.target as HTMLDetailsElement).open
    }
</script>

<style scoped>
    .disclosure-box summary {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: rgb(var(--v-theme-ink));
        font-size: 0.8125rem;
        font-weight: 500;
        line-height: 1.25rem;
        list-style: none;
        cursor: pointer;
    }

    .disclosure-box summary::-webkit-details-marker {
        display: none;
    }

    .disclosure-box__chevron {
        color: rgb(var(--v-theme-ink-muted));
        transition: transform 0.12s ease;
    }

    .disclosure-box[open] .disclosure-box__chevron {
        transform: rotate(90deg);
    }

    .disclosure-box__content {
        margin-top: 12px;
    }
</style>
