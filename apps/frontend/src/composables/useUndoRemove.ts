import { shallowRef } from 'vue'
import { useNotify } from '@/composables/useNotify.ts'

export interface UndoRemoval {
    text: string
    errorText: string
    commit: () => Promise<unknown>
}

export function useUndoRemove<K>() {
    const notify = useNotify()
    const hidden = shallowRef(new Set<K>())

    function remove(key: K, removal: UndoRemoval) {
        hidden.value = new Set(hidden.value).add(key)
        notify.undo(
            removal.text,
            () => {
                removal.commit().then(
                    () => restore(key),
                    () => {
                        restore(key)
                        notify.error(removal.errorText, { retry: () => remove(key, removal) })
                    },
                )
            },
            () => restore(key),
        )
    }

    function restore(key: K) {
        const next = new Set(hidden.value)
        next.delete(key)
        hidden.value = next
    }

    function isHidden(key: K) {
        return hidden.value.has(key)
    }

    return { remove, isHidden }
}
