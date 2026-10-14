<template>
    <span class="app-logo" :style="{ gap: wordmark ? `${gap}px` : undefined }">
        <svg
            class="app-logo__mark"
            :width="size"
            :height="size"
            viewBox="0 0 32 32"
            :role="wordmark ? undefined : 'img'"
            :aria-hidden="wordmark ? 'true' : undefined"
            :aria-label="wordmark ? undefined : t('app.name')"
        >
            <rect class="app-logo__tile" width="32" height="32" rx="7" />
            <g transform="rotate(-14 16 14.5)">
                <rect class="app-logo__letter" x="10" y="7.5" width="12" height="14" rx="1.5" />
                <path class="app-logo__flap" d="M11.25 9 16 12.5l4.75-3.5" />
            </g>
            <rect class="app-logo__slot" x="6" y="18.5" width="20" height="5.5" rx="2.75" />
        </svg>
        <span v-if="wordmark" class="app-logo__wordmark" :style="{ fontSize: `${fontSize}px` }">
            {{ t('app.name') }}
        </span>
    </span>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'

    const props = withDefaults(defineProps<{ size?: number; wordmark?: boolean }>(), {
        size: 28,
        wordmark: false,
    })

    const { t } = useI18n()
    const fontSize = computed(() => Math.round(props.size / 1.75))
    const gap = computed(() => (props.size >= 40 ? 12 : 8))
</script>

<style scoped>
    .app-logo {
        display: inline-flex;
        align-items: center;
    }

    .app-logo__mark {
        display: block;
        flex: none;
    }

    .app-logo__tile {
        fill: rgb(var(--v-theme-primary));
    }

    .app-logo__letter {
        fill: rgb(var(--v-theme-primary));
        stroke: rgb(var(--v-theme-on-primary));
        stroke-width: 2;
    }

    .app-logo__flap {
        fill: none;
        stroke: rgb(var(--v-theme-on-primary));
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .app-logo__slot {
        fill: rgb(var(--v-theme-on-primary));
    }

    .app-logo__wordmark {
        font-weight: 600;
        line-height: 1.5;
        letter-spacing: -0.01em;
        color: rgb(var(--v-theme-ink));
        white-space: nowrap;
    }
</style>
