<template>
    <VCard
        tag="section"
        class="section-card"
        :class="{
            'section-card--danger': danger,
            'section-card--header-only': !$slots.default && !$slots.note && !$slots.footer,
        }"
        :aria-labelledby="titleId"
        :aria-busy="refetching || undefined"
    >
        <VProgressLinear
            v-if="refetching"
            class="section-card__progress"
            color="ink"
            height="2"
            indeterminate
            absolute
        />
        <header class="section-card__header">
            <div class="section-card__heading">
                <h2 :id="titleId" class="section-card__title">
                    {{ title }}
                    <span v-if="count !== undefined" class="section-card__count">{{ n(count) }}</span>
                    <slot name="title-append" />
                </h2>
                <p v-if="description" class="section-card__description">{{ description }}</p>
            </div>
            <div v-if="$slots.actions" class="section-card__actions">
                <slot name="actions" />
            </div>
        </header>
        <div v-if="$slots.default" class="section-card__body" :class="{ 'section-card__body--flush': flush }">
            <slot />
        </div>
        <p v-if="$slots.note" class="section-card__note">
            <slot name="note" />
        </p>
        <footer v-if="$slots.footer" class="section-card__footer">
            <slot name="footer" />
        </footer>
    </VCard>
</template>

<script setup lang="ts">
    import { useId } from 'vue'
    import { useI18n } from 'vue-i18n'

    withDefaults(
        defineProps<{
            title: string
            description?: string
            count?: number
            refetching?: boolean
            danger?: boolean
            flush?: boolean
        }>(),
        { description: undefined, count: undefined, refetching: false, danger: false, flush: false },
    )

    const { n } = useI18n()
    const titleId = useId()
</script>

<style scoped>
    .section-card {
        position: relative;
        overflow: hidden;
        min-width: 0;
        background: rgb(var(--v-theme-surface));
        border-color: rgb(var(--v-theme-border));
    }

    .section-card__progress {
        top: 0;
    }

    .section-card__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px 16px;
        padding: 20px 24px 0;
    }

    .section-card__heading {
        min-width: 0;
        flex: 1 1 240px;
    }

    .section-card__title {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.5rem;
        color: rgb(var(--v-theme-ink));
    }

    .section-card__count {
        color: rgb(var(--v-theme-ink-muted));
        font-weight: 400;
        font-variant-numeric: tabular-nums;
    }

    .section-card__description {
        margin: 2px 0 0;
        color: rgb(var(--v-theme-ink-muted));
    }

    .section-card__actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        flex: none;
    }

    .section-card__body {
        display: grid;
        gap: 20px;
        padding: 16px 24px 24px;
    }

    .section-card__body--flush {
        display: block;
        padding: 12px 0 8px;
    }

    .section-card__note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0;
        padding: 12px 24px 16px;
        border-top: 1px solid rgb(var(--v-theme-border));
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .section-card__footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 24px;
        border-top: 1px solid rgb(var(--v-theme-border));
    }

    .section-card--header-only .section-card__header {
        padding-bottom: 20px;
    }

    .section-card--danger .section-card__title {
        color: rgb(var(--v-theme-error));
    }

    @media (max-width: 599.98px) {
        .section-card__header {
            padding: 16px 16px 0;
        }

        .section-card--header-only .section-card__header {
            padding-bottom: 16px;
        }

        .section-card__body {
            padding: 16px;
        }

        .section-card__body--flush {
            padding: 8px 0;
        }

        .section-card__note,
        .section-card__footer {
            padding-left: 16px;
            padding-right: 16px;
        }
    }
</style>
