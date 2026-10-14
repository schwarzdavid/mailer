<template>
    <VBtn
        class="icon-button"
        :class="{ 'icon-button--danger': danger, 'icon-button--done': done }"
        :variant="outlined ? 'outlined' : 'text'"
        :color="done ? 'success' : undefined"
        :width="dimension"
        :height="dimension"
        :min-width="dimension"
        :aria-label="label"
        :loading="loading"
        :disabled="disabled"
        :to="to"
        :type="type"
        rounded="md"
        icon
        @click="emit('click', $event)"
    >
        <VIcon :icon="icon" :size="small ? 18 : 20" />
        <VTooltip activator="parent" :text="label" />
    </VBtn>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import type { RouteLocationRaw } from 'vue-router'

    const props = withDefaults(
        defineProps<{
            icon: string
            label: string
            small?: boolean
            danger?: boolean
            outlined?: boolean
            loading?: boolean
            disabled?: boolean
            done?: boolean
            to?: RouteLocationRaw
            type?: 'button' | 'submit'
        }>(),
        {
            small: false,
            danger: false,
            outlined: false,
            loading: false,
            disabled: false,
            done: false,
            to: undefined,
            type: 'button',
        },
    )

    const emit = defineEmits<{ click: [event: MouseEvent] }>()

    const dimension = computed(() => (props.small ? 32 : 36))
</script>

<style scoped>
    .icon-button.v-btn--variant-text {
        color: rgb(var(--v-theme-ink-muted));
    }

    .icon-button.v-btn--variant-text:hover {
        color: rgb(var(--v-theme-ink));
    }

    .icon-button--danger.v-btn--variant-text:hover,
    .icon-button--danger.v-btn--variant-text:focus-visible {
        background: rgb(var(--v-theme-error-container));
        color: rgb(var(--v-theme-error));
    }

    .icon-button--done.v-btn--variant-text {
        color: rgb(var(--v-theme-success));
    }

    @media (max-width: 599.98px) {
        .icon-button::before {
            content: '';
            position: absolute;
            inset: -4px;
        }
    }
</style>
