<template>
    <div class="template-preview">
        <InlineAlert
            v-if="preview.error"
            tone="warning"
            :title="
                preview.line
                    ? t('module.inboundForms.template.errorOnLine', { line: preview.line })
                    : t('module.inboundForms.template.error')
            "
        >
            <span class="mono">{{ preview.error }}</span>
            <span v-if="lastGood" class="template-preview__stale">{{
                t('module.inboundForms.template.showingLastGood')
            }}</span>
        </InlineAlert>
        <dl class="template-preview__head">
            <div>
                <dt>{{ t('module.inboundForms.template.from') }}</dt>
                <dd class="mono">{{ from }}</dd>
            </div>
            <div>
                <dt>{{ t('module.inboundForms.template.to') }}</dt>
                <dd class="mono">{{ renderAddress(to) }}</dd>
            </div>
            <div v-if="replyTo">
                <dt>{{ t('module.inboundForms.template.replyTo') }}</dt>
                <dd class="mono">{{ renderAddress(replyTo) }}</dd>
            </div>
            <div>
                <dt>{{ t('module.inboundForms.template.subject') }}</dt>
                <dd>{{ renderedSubject }}</dd>
            </div>
        </dl>
        <div class="template-preview__stage" :class="{ 'template-preview__stage--stale': preview.error && lastGood }">
            <iframe
                v-if="shownHtml"
                class="template-preview__frame"
                :style="{ maxWidth: device === 'mobile' ? '375px' : '100%' }"
                sandbox=""
                :srcdoc="shownHtml"
                :title="t('module.inboundForms.template.preview')"
            />
            <p v-else class="template-preview__empty">{{ t('module.inboundForms.template.nothingToPreview') }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref, toRef, watch } from 'vue'
    import Handlebars from 'handlebars'
    import { useI18n } from 'vue-i18n'
    import { refDebounced } from '@vueuse/core'
    import InlineAlert from '@/components/InlineAlert.vue'

    const props = withDefaults(
        defineProps<{
            template: string
            subject?: string
            sampleData: Record<string, unknown>
            from?: string
            to?: string
            replyTo?: string | null
            device?: 'desktop' | 'mobile'
        }>(),
        { subject: '', from: '', to: '', replyTo: null, device: 'desktop' },
    )
    const emit = defineEmits<{ error: [line: number | null] }>()

    const { t } = useI18n()
    const debouncedTemplate = refDebounced(toRef(props, 'template'), 300)
    const lastGood = ref('')

    const preview = computed(() => {
        try {
            return { html: Handlebars.compile(debouncedTemplate.value)(props.sampleData), error: null, line: null }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const line = /line (\d+)/i.exec(message)?.[1]
            return { html: '', error: message.split('\n')[0] ?? message, line: line ? Number(line) : null }
        }
    })

    const shownHtml = computed(() => (preview.value.error ? lastGood.value : preview.value.html))

    const renderedSubject = computed(() => {
        try {
            return Handlebars.compile(props.subject)(props.sampleData)
        } catch {
            return props.subject
        }
    })

    watch(
        preview,
        (value) => {
            if (!value.error) {
                lastGood.value = value.html
            }
            emit('error', value.line)
        },
        { immediate: true },
    )

    function renderAddress(value: string) {
        try {
            return Handlebars.compile(value)(props.sampleData)
        } catch {
            return value
        }
    }
</script>

<style scoped>
    .template-preview {
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        min-height: 0;
    }

    .template-preview__stale {
        display: block;
        margin-top: 4px;
        color: rgb(var(--v-theme-ink-muted));
    }

    .template-preview__head {
        display: grid;
        gap: 4px;
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .template-preview__head div {
        display: flex;
        gap: 6px;
        min-width: 0;
    }

    .template-preview__head dd {
        margin: 0;
        overflow: hidden;
        color: rgb(var(--v-theme-ink));
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .template-preview__stage {
        display: flex;
        justify-content: center;
        flex: 1;
        min-height: 320px;
        padding: 16px;
        border-radius: 6px;
        background: rgb(var(--v-theme-surface-sunken));
    }

    .template-preview__stage--stale .template-preview__frame {
        opacity: 0.55;
    }

    .template-preview__frame {
        width: 100%;
        height: 100%;
        min-height: 300px;
        border: 0;
        border-radius: 6px;
        background: #ffffff;
        color-scheme: light;
        box-shadow: var(--v-shadow-sm);
    }

    .template-preview__empty {
        align-self: center;
        color: rgb(var(--v-theme-ink-muted));
    }
</style>
