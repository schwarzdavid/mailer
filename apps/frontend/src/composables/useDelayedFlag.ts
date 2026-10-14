import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export const SKELETON_DELAY = 150

export function useDelayedFlag(source: MaybeRefOrGetter<boolean>, delay = SKELETON_DELAY) {
    const flag = ref(false)
    let timer: ReturnType<typeof setTimeout> | undefined

    watch(
        () => toValue(source),
        (active) => {
            clearTimeout(timer)
            if (!active) {
                flag.value = false
                return
            }
            timer = setTimeout(() => {
                flag.value = true
            }, delay)
        },
        { immediate: true },
    )

    onScopeDispose(() => clearTimeout(timer))

    return flag
}
