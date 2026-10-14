<template>
    <span v-if="dirty" class="save-footer__hint">
        <StatusDot tone="warning" />
        {{ t('form.unsavedChanges') }}
    </span>
    <VBtn v-if="dirty" variant="text" :text="t('cta.discard')" :disabled="pending" @click="emit('discard')" />
    <VBtn variant="flat" color="primary" type="submit" :form="form" :text="label ?? t('cta.save')" :loading="pending" />
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import StatusDot from '@/components/StatusDot.vue'

    withDefaults(defineProps<{ dirty: boolean; pending: boolean; form: string; label?: string }>(), {
        label: undefined,
    })

    const emit = defineEmits<{ discard: [] }>()
    const { t } = useI18n()
</script>

<style scoped>
    .save-footer__hint {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-right: auto;
        color: rgb(var(--v-theme-ink-muted));
    }
</style>
