import { afterEach, describe, expect, it, vi } from 'vitest'
import { BounceApi, type EmailBlockDto } from 'api'
import { useUnblockMutation } from '../useUnblockMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const unblocked: EmailBlockDto = {
    emailBlockId: 5,
    emailAddress: 'missing@example.org',
    blockCount: 2,
    blockedUntil: null,
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUnblockMutation', () => {
    it('unblocks by id and invalidates the blocked list', async () => {
        const unblock = vi.spyOn(BounceApi, 'unblock').mockResolvedValue(unblocked)
        const { result, queryClient, unmount } = withVueQuery(() => useUnblockMutation())
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync(5)

        expect(unblock).toHaveBeenCalledWith({ path: { emailBlockId: 5 } })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bounces.blocked'] })
        unmount()
    })
})
