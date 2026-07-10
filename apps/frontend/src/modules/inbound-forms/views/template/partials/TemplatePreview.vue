<template>
    <VAlert v-if="preview.error" color="warning" icon="mdi-alert">
        {{ t('module.inboundForms.template.previewError', { error: preview.error }) }}
    </VAlert>
    <iframe
        v-else
        class="preview-frame"
        sandbox=""
        :srcdoc="preview.html"
        :title="t('module.inboundForms.template.preview')"
    />
</template>

<script setup lang="ts">
    import { computed, toRef } from 'vue'
    import Handlebars from 'handlebars'
    import { useI18n } from 'vue-i18n'
    import { refDebounced } from '@vueuse/core'

    const props = defineProps<{ template: string; sampleData: Record<string, unknown> }>()

    const { t } = useI18n()
    const debouncedTemplate = refDebounced(toRef(props, 'template'), 300)

    const preview = computed(() => {
        try {
            return { html: Handlebars.compile(debouncedTemplate.value)(props.sampleData), error: null }
        } catch (error) {
            return { html: '', error: error instanceof Error ? error.message : String(error) }
        }
    })
</script>

<style scoped>
    .preview-frame {
        width: 100%;
        height: 100%;
        min-height: 480px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 4px;
        background: white;
    }
</style>
