<template>
    <div class="copy-field" :class="{ 'copy-field--inline': inline }">
        <div class="copy-field__main">
            <span
                ref="valueElement"
                class="copy-field__value"
                :class="{ 'copy-field__value--clamped': isClamped, 'copy-field__value--masked': isMasked }"
                :title="inline ? value : undefined"
                >{{ displayed }}</span
            >
            <button
                v-if="clamp && !inline"
                type="button"
                class="copy-field__more"
                :aria-expanded="expanded"
                @click="expanded = !expanded"
            >
                {{ expanded ? t('copy.showLess') : t('copy.showFull') }}
            </button>
        </div>
        <div class="copy-field__tools">
            <span v-if="copied && !inline" class="copy-field__done">{{ t('copy.copied') }}</span>
            <IconButton
                v-if="secret"
                :icon="revealed ? mdiEyeOffOutline : mdiEyeOutline"
                :label="revealed ? t('copy.hide', { label }) : t('copy.reveal', { label })"
                small
                @click="revealed = !revealed"
            />
            <IconButton
                :icon="copied ? mdiCheck : mdiContentCopy"
                :label="t('copy.action', { label })"
                :done="copied"
                small
                @click="copyValue"
            />
        </div>
        <span class="sr-only" aria-live="polite">{{ announcement }}</span>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref, useTemplateRef } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useClipboard } from '@vueuse/core'
    import { mdiCheck, mdiContentCopy, mdiEyeOffOutline, mdiEyeOutline } from '@mdi/js'
    import IconButton from '@/components/IconButton.vue'

    const props = withDefaults(
        defineProps<{ value: string; label: string; clamp?: boolean; secret?: boolean; inline?: boolean }>(),
        { clamp: false, secret: false, inline: false },
    )

    const { t } = useI18n()
    const { copy, copied } = useClipboard({ copiedDuring: 2000, legacy: true })
    const valueElement = useTemplateRef('valueElement')
    const expanded = ref(false)
    const revealed = ref(false)

    const isMasked = computed(() => props.secret && !revealed.value)
    const isClamped = computed(() => props.clamp && !expanded.value && !props.inline)
    const displayed = computed(() => (isMasked.value ? '•'.repeat(Math.min(props.value.length, 24)) : props.value))
    const announcement = computed(() => (copied.value ? t('copy.announce', { label: props.label }) : ''))

    async function copyValue() {
        try {
            await copy(props.value)
        } catch {
            selectValue()
            return
        }
        if (!copied.value) {
            selectValue()
        }
    }

    function selectValue() {
        const element = valueElement.value
        if (!element) {
            return
        }
        const range = document.createRange()
        range.selectNodeContents(element)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
    }
</script>

<style scoped>
    .copy-field {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        min-width: 0;
        padding: 6px 4px 6px 12px;
        border-radius: 6px;
        background: rgb(var(--v-theme-surface-sunken));
    }

    .copy-field__main {
        flex: 1;
        min-width: 0;
    }

    .copy-field__value {
        display: block;
        min-width: 0;
        padding: 6px 0;
        font-family: var(--font-mono);
        font-size: 0.8125rem;
        line-height: 1.25rem;
        font-variant-ligatures: none;
        color: rgb(var(--v-theme-ink));
        overflow-wrap: anywhere;
        word-break: break-all;
        white-space: pre-wrap;
    }

    .copy-field__value--clamped {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        padding-bottom: 0;
        margin-bottom: 4px;
    }

    .copy-field__value--masked {
        letter-spacing: 0.12em;
    }

    .copy-field__tools {
        display: flex;
        align-items: center;
        gap: 2px;
        flex: none;
    }

    .copy-field__done {
        padding-right: 6px;
        color: rgb(var(--v-theme-success));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
        white-space: nowrap;
    }

    .copy-field__more {
        display: inline-flex;
        margin: 0 0 4px;
        padding: 0;
        border: 0;
        background: none;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
        text-decoration: underline;
        cursor: pointer;
    }

    .copy-field__more:hover {
        color: rgb(var(--v-theme-ink));
    }

    .copy-field--inline {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        padding: 0 0 0 8px;
        background: transparent;
    }

    .copy-field--inline .copy-field__value {
        padding: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        word-break: normal;
    }
</style>
