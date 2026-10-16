<template>
    <div class="disclosure-box">
        <button
            type="button"
            class="disclosure-box__summary"
            :aria-expanded="open"
            :aria-controls="contentId"
            @click="open = !open"
        >
            <VIcon
                :icon="mdiChevronRight"
                size="18"
                class="disclosure-box__chevron"
                :class="{ 'disclosure-box__chevron--open': open }"
                aria-hidden="true"
            />
            {{ summary }}
        </button>
        <VExpandTransition>
            <div v-if="open" :id="contentId" class="disclosure-box__content">
                <slot />
            </div>
        </VExpandTransition>
    </div>
</template>

<script setup lang="ts">
    import { ref, useId } from 'vue'
    import { mdiChevronRight } from '@mdi/js'

    const props = withDefaults(defineProps<{ summary: string; defaultOpen?: boolean }>(), { defaultOpen: false })

    const open = ref(props.defaultOpen)
    const contentId = useId()
</script>

<style scoped>
    .disclosure-box__summary {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0;
        border: 0;
        background: none;
        color: rgb(var(--v-theme-ink));
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        line-height: 1.25rem;
        cursor: pointer;
    }

    .disclosure-box__summary:focus-visible {
        outline: 2px solid rgb(var(--v-theme-focus));
        outline-offset: 2px;
        border-radius: 4px;
    }

    .disclosure-box__chevron {
        color: rgb(var(--v-theme-ink-muted));
        transition: transform 0.12s ease;
    }

    .disclosure-box__chevron--open {
        transform: rotate(90deg);
    }

    .disclosure-box__content {
        padding-top: 12px;
    }
</style>
