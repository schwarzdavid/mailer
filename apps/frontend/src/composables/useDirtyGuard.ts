import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useEventListener } from '@vueuse/core'
import { useConfirm } from '@/composables/useConfirm.ts'
import { formValuesEqual } from '@/helper/formValuesEqual.ts'

export function useDiscardConfirm() {
    const { t } = useI18n()
    const confirm = useConfirm()

    return () =>
        confirm({
            title: t('dialog.discard.title'),
            body: t('dialog.discard.body'),
            confirmLabel: t('dialog.discard.confirm'),
            cancelLabel: t('dialog.discard.cancel'),
            destructive: true,
        })
}

export function useDirtyGuard(dirty: MaybeRefOrGetter<boolean>) {
    const confirmDiscard = useDiscardConfirm()

    onBeforeRouteLeave(() => (toValue(dirty) ? confirmDiscard() : true))

    useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
        if (toValue(dirty)) {
            event.preventDefault()
        }
    })
}

export function useFormChanged(current: MaybeRefOrGetter<unknown>, initial: MaybeRefOrGetter<unknown>) {
    return computed(() => !formValuesEqual(toValue(initial), toValue(current)))
}
