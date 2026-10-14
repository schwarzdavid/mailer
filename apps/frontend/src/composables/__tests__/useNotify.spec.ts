import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useNotificationHost, useNotify } from '../useNotify.ts'

const host = useNotificationHost()

afterEach(() => {
    host.dismiss()
})

describe('useNotify', () => {
    it('shows one notification at a time, newest wins', () => {
        const notify = useNotify()

        notify.success('Project saved')
        notify.error('Couldn’t save')

        expect(host.current.value?.kind).toBe('error')
        expect(host.current.value?.text).toBe('Couldn’t save')
    })

    it('keeps errors until dismissed', () => {
        useNotify().error('Failed')

        expect(host.current.value?.timeout).toBe(-1)
    })

    it('commits an undo when it is dismissed', () => {
        const commit: Mock<() => void> = vi.fn<() => void>()
        const onUndo: Mock<() => void> = vi.fn<() => void>()
        useNotify().undo('Field removed', commit, onUndo)

        host.dismiss()

        expect(commit).toHaveBeenCalledOnce()
        expect(onUndo).not.toHaveBeenCalled()
    })

    it('commits an undo when a newer notification replaces it', () => {
        const commit: Mock<() => void> = vi.fn<() => void>()
        const notify = useNotify()
        notify.undo('Field removed', commit, vi.fn<() => void>())

        notify.success('Saved')

        expect(commit).toHaveBeenCalledOnce()
    })

    it('reverts instead of committing when undone', () => {
        const commit: Mock<() => void> = vi.fn<() => void>()
        const onUndo: Mock<() => void> = vi.fn<() => void>()
        useNotify().undo('Field removed', commit, onUndo)

        host.undo()

        expect(onUndo).toHaveBeenCalledOnce()
        expect(commit).not.toHaveBeenCalled()
        expect(host.current.value).toBeNull()
    })

    it('runs the retry callback', () => {
        const retry: Mock<() => void> = vi.fn<() => void>()
        useNotify().error('Failed', { retry })

        host.retry()

        expect(retry).toHaveBeenCalledOnce()
        expect(host.current.value).toBeNull()
    })
})
