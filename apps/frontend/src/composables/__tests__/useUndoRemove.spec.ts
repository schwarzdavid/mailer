import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useUndoRemove } from '../useUndoRemove.ts'
import { useNotificationHost } from '../useNotify.ts'

const host = useNotificationHost()

afterEach(() => {
    host.dismiss()
})

describe('useUndoRemove', () => {
    it('hides the item until the removal is undone', () => {
        const commit: Mock<() => Promise<unknown>> = vi.fn<() => Promise<unknown>>()
        const { remove, isHidden } = useUndoRemove<number>()

        remove(4, { text: 'Removed', errorText: 'Failed', commit })
        expect(isHidden(4)).toBe(true)

        host.undo()
        expect(isHidden(4)).toBe(false)
        expect(commit).not.toHaveBeenCalled()
    })

    it('sends the removal once the snackbar is dismissed', async () => {
        const commit: Mock<() => Promise<unknown>> = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
        const { remove, isHidden } = useUndoRemove<number>()

        remove(4, { text: 'Removed', errorText: 'Failed', commit })
        host.dismiss()

        expect(commit).toHaveBeenCalledOnce()
        await vi.waitFor(() => expect(isHidden(4)).toBe(false))
    })

    it('brings the item back and offers a retry when the removal fails', async () => {
        const commit: Mock<() => Promise<unknown>> = vi
            .fn<() => Promise<unknown>>()
            .mockRejectedValue(new Error('nope'))
        const { remove, isHidden } = useUndoRemove<number>()

        remove(4, { text: 'Removed', errorText: 'Couldn’t remove', commit })
        host.dismiss()

        await vi.waitFor(() => expect(host.current.value?.kind).toBe('error'))
        expect(host.current.value?.text).toBe('Couldn’t remove')
        expect(isHidden(4)).toBe(false)

        host.retry()
        expect(isHidden(4)).toBe(true)
        expect(host.current.value?.kind).toBe('undo')
    })
})
