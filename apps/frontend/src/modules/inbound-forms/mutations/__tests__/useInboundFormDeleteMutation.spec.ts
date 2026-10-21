import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormDetailDto } from 'api'
import { useInboundFormDeleteMutation } from '../useInboundFormDeleteMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const detail: InboundFormDetailDto = {
    inboundFormId: 1,
    projectId: 5,
    domainId: null,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    allowedHostnames: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [],
    security: [],
    receivers: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormDeleteMutation', () => {
    it('deletes the form, drops its cached detail and refreshes the projects', async () => {
        const deleteSpy = vi.spyOn(InboundFormApi, 'deleteInboundForm').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormDeleteMutation())
        queryClient.setQueryData(['inboundForms', 1], detail)
        queryClient.setQueryData(['inboundForms', 2], { ...detail, inboundFormId: 2 })
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync(1)

        expect(deleteSpy).toHaveBeenCalledWith({ path: { inboundFormId: 1 } })
        expect(queryClient.getQueryData(['inboundForms', 1])).toBeUndefined()
        expect(queryClient.getQueryData(['inboundForms', 2])).toEqual({ ...detail, inboundFormId: 2 })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        unmount()
    })

    it('keeps the cached form when the request fails', async () => {
        vi.spyOn(InboundFormApi, 'deleteInboundForm').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormDeleteMutation())
        queryClient.setQueryData(['inboundForms', 1], detail)

        await expect(result.mutateAsync(1)).rejects.toThrow('Forbidden')

        expect(queryClient.getQueryData(['inboundForms', 1])).toEqual(detail)
        unmount()
    })
})
