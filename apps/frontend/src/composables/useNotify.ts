import { computed, shallowRef } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export type NotificationKind = 'success' | 'error' | 'undo' | 'info'

export interface NotificationLink {
    label: string
    to: RouteLocationRaw
}

export interface Notification {
    id: number
    kind: NotificationKind
    text: string
    detail?: string
    timeout: number
    link?: NotificationLink
    retry?: () => void
    undo?: () => void
    commit?: () => void
}

export const UNDO_TIMEOUT = 8000
const SUCCESS_TIMEOUT = 4000

const current = shallowRef<Notification | null>(null)
let nextId = 1

function settle(notification: Notification | null) {
    notification?.commit?.()
}

function show(notification: Omit<Notification, 'id'>) {
    const previous = current.value
    current.value = { ...notification, id: nextId++ }
    settle(previous)
}

function dismiss() {
    const previous = current.value
    current.value = null
    settle(previous)
}

function undo() {
    const previous = current.value
    current.value = null
    previous?.undo?.()
}

function runRetry() {
    const previous = current.value
    current.value = null
    previous?.retry?.()
}

export function useNotify() {
    return {
        success(text: string, options: { link?: NotificationLink } = {}) {
            show({ kind: 'success', text, timeout: SUCCESS_TIMEOUT, link: options.link })
        },
        info(text: string, options: { link?: NotificationLink } = {}) {
            show({ kind: 'info', text, timeout: SUCCESS_TIMEOUT, link: options.link })
        },
        error(text: string, options: { retry?: () => void; detail?: string } = {}) {
            show({ kind: 'error', text, timeout: -1, retry: options.retry, detail: options.detail })
        },
        undo(text: string, commit: () => void, onUndo: () => void) {
            show({ kind: 'undo', text, timeout: UNDO_TIMEOUT, commit, undo: onUndo })
        },
    }
}

export function useNotificationHost() {
    return {
        current: computed(() => current.value),
        dismiss,
        undo,
        retry: runRetry,
    }
}
