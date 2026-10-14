<template>
    <RouterLink
        :to="item.to"
        class="nav-item"
        :class="{ 'nav-item--active': active, 'nav-item--rail': rail }"
        :aria-current="active ? 'page' : undefined"
        :aria-label="rail ? item.title : undefined"
        :aria-describedby="item.attention ? attentionId : undefined"
    >
        <VIcon :icon="item.icon" size="20" />
        <span v-if="!rail" class="nav-item__title">{{ item.title }}</span>
        <StatusDot v-if="item.attention" tone="warning" class="nav-item__dot" />
        <span v-if="item.attention" :id="attentionId" class="sr-only">{{ item.attention }}</span>
        <VTooltip
            v-if="rail || item.attention"
            activator="parent"
            location="end"
            :text="item.attention ? `${item.title} · ${item.attention}` : item.title"
        />
    </RouterLink>
</template>

<script setup lang="ts">
    import { computed, useId } from 'vue'
    import { useRoute } from 'vue-router'
    import StatusDot from '@/components/StatusDot.vue'
    import type { NavigationItem } from '@/modules/dashboard/layouts/partials/navigationItem.ts'

    const props = defineProps<{ item: NavigationItem; rail: boolean }>()

    const route = useRoute()
    const attentionId = useId()
    const active = computed(() => route.meta.section === props.item.section)
</script>

<style scoped>
    .nav-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        height: 40px;
        padding: 0 12px;
        border-radius: 6px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 1.25rem;
        text-decoration: none;
        white-space: nowrap;
        transition:
            background-color 0.12s ease,
            color 0.12s ease;
    }

    .nav-item:hover {
        background: rgb(var(--v-theme-surface-hover));
        color: rgb(var(--v-theme-ink));
    }

    .nav-item:focus-visible {
        outline: 2px solid rgb(var(--v-theme-focus));
        outline-offset: -2px;
    }

    .nav-item--active,
    .nav-item--active:hover {
        background: rgb(var(--v-theme-primary-container));
        color: rgb(var(--v-theme-on-primary-container));
        font-weight: 600;
    }

    .nav-item__title {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .nav-item__dot {
        margin-left: auto;
    }

    .nav-item--rail {
        justify-content: center;
        height: 44px;
        padding: 0;
    }

    .nav-item--rail .nav-item__dot {
        position: absolute;
        top: 9px;
        right: 10px;
        margin: 0;
    }

    @media (max-width: 599.98px) {
        .nav-item {
            height: 44px;
        }
    }
</style>
