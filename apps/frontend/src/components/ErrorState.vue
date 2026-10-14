<template>
    <div class="state-panel" :class="[`state-panel--${size}`, { 'state-panel--error': kind === 'load' }]" role="alert">
        <span class="state-panel__disc" aria-hidden="true">
            <VIcon :icon="icon" :size="size === 'page' ? 24 : 20" />
        </span>
        <component :is="size === 'page' ? 'h2' : 'h3'" class="state-panel__title">{{ heading }}</component>
        <p class="state-panel__text">{{ text }}</p>
        <div v-if="kind === 'load' || $slots.actions" class="state-panel__actions">
            <VBtn
                v-if="kind === 'load'"
                :prepend-icon="mdiRefresh"
                :text="t('state.retry')"
                :loading="retrying"
                @click="emit('retry')"
            />
            <slot name="actions" />
        </div>
        <details v-if="kind === 'load' && size === 'page' && details" class="state-panel__details">
            <summary>{{ t('state.details') }}</summary>
            <pre>{{ details }}</pre>
        </details>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { mdiCloudAlertOutline, mdiFileQuestionOutline, mdiLockOutline, mdiRefresh } from '@mdi/js'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'

    const props = withDefaults(
        defineProps<{
            kind?: 'load' | 'notFound' | 'forbidden'
            size?: 'page' | 'section'
            thing?: string
            permission?: string
            error?: unknown
            retrying?: boolean
        }>(),
        {
            kind: 'load',
            size: 'section',
            thing: undefined,
            permission: undefined,
            error: undefined,
            retrying: false,
        },
    )

    const emit = defineEmits<{ retry: [] }>()
    const { t } = useI18n()

    const icon = computed(
        () => ({ load: mdiCloudAlertOutline, notFound: mdiFileQuestionOutline, forbidden: mdiLockOutline })[props.kind],
    )

    const thingLabel = computed(() => props.thing ?? t('state.thing'))

    const heading = computed(() => {
        switch (props.kind) {
            case 'notFound':
                return t('state.notFound.title', { thing: thingLabel.value })
            case 'forbidden':
                return t('state.forbidden.title')
            default:
                return t('state.load.title', { thing: thingLabel.value })
        }
    })

    const text = computed(() => {
        switch (props.kind) {
            case 'notFound':
                return t('state.notFound.text')
            case 'forbidden':
                return props.permission
                    ? t('state.forbidden.textPermission', { permission: props.permission })
                    : t('state.forbidden.text')
            default:
                return t('state.load.text')
        }
    })

    const details = computed(() => {
        if (props.error === undefined) {
            return undefined
        }
        const status = apiErrorStatus(props.error)
        const lines = [
            `${t('state.detail.status')}: ${status ?? '—'}`,
            `${t('state.detail.message')}: ${apiErrorMessage(props.error, '—')}`,
            `${t('state.detail.time')}: ${new Date().toISOString()}`,
            `${t('state.detail.page')}: ${location.pathname}`,
        ]
        return lines.join('\n')
    })
</script>
