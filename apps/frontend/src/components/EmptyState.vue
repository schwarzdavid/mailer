<template>
    <div class="state-panel" :class="[`state-panel--${size}`, { 'state-panel--success': tone === 'success' }]">
        <span class="state-panel__disc" aria-hidden="true">
            <VIcon :icon="icon" :size="size === 'page' ? 24 : 20" />
        </span>
        <component :is="size === 'page' ? 'h2' : 'h3'" class="state-panel__title">{{ title }}</component>
        <p v-if="text" class="state-panel__text">{{ text }}</p>
        <div v-if="$slots.actions" class="state-panel__actions">
            <slot name="actions" />
        </div>
    </div>
</template>

<script setup lang="ts">
    withDefaults(
        defineProps<{
            icon: string
            title: string
            text?: string
            size?: 'page' | 'section'
            tone?: 'neutral' | 'success'
        }>(),
        { text: undefined, size: 'section', tone: 'neutral' },
    )
</script>
