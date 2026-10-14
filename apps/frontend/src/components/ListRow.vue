<template>
    <component
        :is="to ? RouterLink : 'div'"
        :to="to"
        class="list-row"
        :class="{
            'list-row--link': !!to,
            'list-row--pending': pending,
            'list-row--selected': selected,
        }"
        :aria-busy="pending || undefined"
    >
        <span v-if="icon || $slots.lead" class="list-row__lead" :class="leadClass">
            <slot name="lead">
                <VIcon :icon="icon" size="20" />
            </slot>
        </span>
        <span class="list-row__main">
            <span class="list-row__title" :class="{ 'list-row__title--mono': monoTitle }">
                <slot name="title">{{ title }}</slot>
            </span>
            <span v-if="subtitle || $slots.subtitle" class="list-row__subtitle">
                <slot name="subtitle">{{ subtitle }}</slot>
            </span>
        </span>
        <span v-if="$slots.meta" class="list-row__meta">
            <slot name="meta" />
        </span>
        <span v-if="$slots.actions" class="list-row__actions">
            <slot name="actions" />
        </span>
        <VIcon v-if="to" class="list-row__chevron" :icon="mdiChevronRight" size="20" aria-hidden="true" />
    </component>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { RouterLink, type RouteLocationRaw } from 'vue-router'
    import { mdiChevronRight } from '@mdi/js'

    const props = withDefaults(
        defineProps<{
            title?: string
            subtitle?: string
            icon?: string
            leadTone?: 'neutral' | 'warning' | 'error' | 'success' | 'none'
            to?: RouteLocationRaw
            pending?: boolean
            selected?: boolean
            monoTitle?: boolean
        }>(),
        {
            title: undefined,
            subtitle: undefined,
            icon: undefined,
            leadTone: 'neutral',
            to: undefined,
            pending: false,
            selected: false,
            monoTitle: false,
        },
    )

    const leadClass = computed(() =>
        props.leadTone === 'none' ? undefined : ['list-row__lead--disc', `list-row__lead--${props.leadTone}`],
    )
</script>

<style scoped>
    .list-row {
        position: relative;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        min-height: 56px;
        padding: 8px 24px;
        color: rgb(var(--v-theme-ink));
        text-decoration: none;
    }

    .list-row + .list-row {
        border-top: 1px solid rgb(var(--v-theme-border));
    }

    .list-row--link {
        cursor: pointer;
        transition: background-color 0.12s ease;
    }

    .list-row--link:hover {
        background: rgb(var(--v-theme-surface-hover));
    }

    .list-row--link:focus-visible {
        outline: 2px solid rgb(var(--v-theme-focus));
        outline-offset: -2px;
        border-radius: 6px;
    }

    .list-row--selected {
        background: rgb(var(--v-theme-primary-container));
    }

    .list-row--pending,
    .list-row--pending .list-row__subtitle {
        color: rgb(var(--v-theme-ink-disabled));
    }

    .list-row__lead {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        color: rgb(var(--v-theme-ink-muted));
    }

    .list-row__lead--disc {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        background: rgb(var(--v-theme-surface-sunken));
    }

    .list-row__lead--warning {
        background: rgb(var(--v-theme-warning-container));
        color: rgb(var(--v-theme-warning));
    }

    .list-row__lead--error {
        background: rgb(var(--v-theme-error-container));
        color: rgb(var(--v-theme-error));
    }

    .list-row__lead--success {
        background: rgb(var(--v-theme-success-container));
        color: rgb(var(--v-theme-success));
    }

    .list-row__main {
        flex: 1 1 0;
        min-width: 0;
        display: grid;
        gap: 2px;
    }

    .list-row__title {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 1.25rem;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .list-row__title--mono {
        font-family: var(--font-mono);
        font-size: 0.8125rem;
        font-weight: 400;
    }

    .list-row__subtitle {
        overflow: hidden;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .list-row__meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
        flex: none;
        max-width: 50%;
    }

    .list-row__actions {
        display: flex;
        align-items: center;
        gap: 2px;
        flex: none;
    }

    .list-row__chevron {
        flex: none;
        color: rgb(var(--v-theme-ink-muted));
    }

    @media (max-width: 599.98px) {
        .list-row {
            padding: 8px 16px;
        }

        .list-row__meta {
            order: 3;
            flex-basis: 100%;
            max-width: none;
            justify-content: flex-start;
            padding-left: 44px;
        }
    }
</style>
