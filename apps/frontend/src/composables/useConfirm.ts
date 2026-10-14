import { shallowRef } from 'vue'

export interface ConfirmOptions {
    title: string
    body?: string
    confirmLabel: string
    cancelLabel?: string
    destructive?: boolean
    action?: () => Promise<unknown>
    errorText?: string
}

export interface PendingConfirm {
    options: ConfirmOptions
    resolve: (confirmed: boolean) => void
}

const pending = shallowRef<PendingConfirm | null>(null)

export function useConfirm() {
    return function confirm(options: ConfirmOptions): Promise<boolean> {
        pending.value?.resolve(false)
        return new Promise<boolean>((resolve) => {
            pending.value = { options, resolve }
        })
    }
}

export function useConfirmHost() {
    function settle(confirmed: boolean) {
        const current = pending.value
        pending.value = null
        current?.resolve(confirmed)
    }

    return { pending, settle }
}
