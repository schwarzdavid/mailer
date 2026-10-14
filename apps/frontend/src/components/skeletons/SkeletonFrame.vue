<template>
    <div class="skeleton-frame" aria-busy="true" :aria-label="label ?? t('state.loading')">
        <div v-if="visible" aria-hidden="true">
            <slot />
        </div>
    </div>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import { useDelayedFlag } from '@/composables/useDelayedFlag.ts'

    withDefaults(defineProps<{ label?: string }>(), { label: undefined })

    const { t } = useI18n()
    const visible = useDelayedFlag(true)
</script>
