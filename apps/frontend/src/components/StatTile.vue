<template>
    <component :is="to ? RouterLink : 'div'" :to="to" class="stat-tile" :class="{ 'stat-tile--link': !!to }">
        <span class="stat-tile__label">{{ label }}</span>
        <span v-if="loading" class="bone bone--headline stat-tile__bone" aria-hidden="true" />
        <span v-else class="stat-tile__value">
            {{ value }}
            <small v-if="total !== undefined">/ {{ total }}</small>
        </span>
        <span v-if="$slots.default" class="stat-tile__sub">
            <slot />
        </span>
    </component>
</template>

<script setup lang="ts">
    import { RouterLink, type RouteLocationRaw } from 'vue-router'

    withDefaults(
        defineProps<{
            label: string
            value?: string | number
            total?: string | number
            to?: RouteLocationRaw
            loading?: boolean
        }>(),
        { value: undefined, total: undefined, to: undefined, loading: false },
    )
</script>

<style scoped>
    .stat-tile {
        display: grid;
        align-content: start;
        gap: 2px;
        padding: 16px 20px;
        border: 1px solid rgb(var(--v-theme-border));
        border-radius: 10px;
        background: rgb(var(--v-theme-surface));
        color: rgb(var(--v-theme-ink));
        text-decoration: none;
    }

    .stat-tile--link {
        transition: background-color 0.12s ease;
    }

    .stat-tile--link:hover {
        background: rgb(var(--v-theme-surface-hover));
    }

    .stat-tile__label {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
    }

    .stat-tile__value {
        font-size: 1.75rem;
        font-weight: 600;
        line-height: 2.25rem;
        letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;
    }

    .stat-tile__value small {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 1rem;
        font-weight: 500;
        letter-spacing: 0;
    }

    .stat-tile__bone {
        width: 56px;
        margin: 6px 0;
    }

    .stat-tile__sub {
        display: flex;
        align-items: center;
        gap: 6px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }
</style>
