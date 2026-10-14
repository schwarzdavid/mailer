<template>
    <header class="page-header">
        <nav v-if="breadcrumbs.length" class="page-header__crumbs" :aria-label="t('nav.breadcrumbs')">
            <ol class="page-header__crumbs-full">
                <li v-for="(crumb, index) in breadcrumbs" :key="index">
                    <VIcon v-if="index > 0" :icon="mdiChevronRight" size="16" aria-hidden="true" />
                    <RouterLink :to="crumb.to">{{ crumb.title }}</RouterLink>
                </li>
            </ol>
            <RouterLink class="page-header__crumbs-back" :to="parent!.to">
                <VIcon :icon="mdiChevronLeft" size="16" aria-hidden="true" />
                {{ parent!.title }}
            </RouterLink>
        </nav>
        <div class="page-header__row">
            <div class="page-header__heading">
                <h1 class="page-header__title">
                    <span v-if="loading" class="bone bone--headline page-header__bone" aria-hidden="true" />
                    <span v-else>{{ title }}</span>
                    <slot name="status" />
                </h1>
                <p v-if="description" class="page-header__description">{{ description }}</p>
                <div v-if="$slots.meta" class="page-header__meta">
                    <slot name="meta" />
                </div>
            </div>
            <div v-if="$slots.actions" class="page-header__actions">
                <slot name="actions" />
            </div>
        </div>
        <slot name="tabs" />
    </header>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useTitle } from '@vueuse/core'
    import { mdiChevronLeft, mdiChevronRight } from '@mdi/js'
    import type { Breadcrumb } from '@/components/breadcrumb.ts'

    const props = withDefaults(
        defineProps<{ title?: string; breadcrumbs?: Breadcrumb[]; description?: string; loading?: boolean }>(),
        { title: '', breadcrumbs: () => [], description: undefined, loading: false },
    )

    const { t } = useI18n()
    const parent = computed(() => props.breadcrumbs[props.breadcrumbs.length - 1])

    useTitle(() => (props.title ? t('app.documentTitle', { page: props.title }) : t('app.name')))
</script>

<style scoped>
    .page-header {
        display: grid;
        gap: 8px;
        margin-bottom: 32px;
    }

    .page-header__crumbs-full {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
        margin: 0;
        padding: 0;
        list-style: none;
        color: rgb(var(--v-theme-ink-muted));
    }

    .page-header__crumbs-full li {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        min-width: 0;
    }

    .page-header__crumbs a {
        max-width: 240px;
        padding: 0 2px;
        overflow: hidden;
        border-radius: 4px;
        color: rgb(var(--v-theme-ink-muted));
        text-decoration: none;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .page-header__crumbs a:hover {
        color: rgb(var(--v-theme-ink));
        text-decoration: underline;
    }

    .page-header__crumbs-back {
        display: none !important;
        align-items: center;
        gap: 2px;
    }

    .page-header__row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 16px;
    }

    .page-header__heading {
        display: grid;
        gap: 4px;
        min-width: 0;
        flex: 1 1 320px;
    }

    .page-header__title {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 12px;
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        line-height: 2rem;
        letter-spacing: -0.01em;
        overflow-wrap: anywhere;
    }

    .page-header__bone {
        width: 240px;
        max-width: 60vw;
    }

    .page-header__description {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
    }

    .page-header__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 16px;
        color: rgb(var(--v-theme-ink-muted));
    }

    .page-header__meta :deep(> span) {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .page-header__actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        flex: none;
    }

    @media (max-width: 599.98px) {
        .page-header__crumbs-full {
            display: none;
        }

        .page-header__crumbs-back {
            display: inline-flex !important;
        }

        .page-header__title {
            font-size: 1.25rem;
            line-height: 1.75rem;
        }

        .page-header__actions {
            width: 100%;
        }

        .page-header__actions :deep(.v-btn--variant-flat) {
            flex: 1 1 auto;
        }
    }
</style>
