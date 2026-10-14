import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormDetailDto } from 'api'
import { useInboundFormUpdateMutation } from '../useInboundFormUpdateMutation.ts'
import { useInboundFormQuery } from '@/modules/inbound-forms/queries/useInboundFormQuery.ts'
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
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [],
    security: [],
    receivers: [],
}

const updated: InboundFormDetailDto = { ...detail, name: 'Support', slug: 'support', domainId: 3, isActive: false }

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormUpdateMutation', () => {
    it('sends the update and stores the returned detail in the form cache', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundForm').mockResolvedValue(updated)
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormUpdateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({
            inboundFormId: 1,
            update: { name: 'Support', slug: 'support', domainId: 3, isActive: false },
        })

        expect(updateSpy).toHaveBeenCalledWith({
            path: { inboundFormId: 1 },
            body: { name: 'Support', slug: 'support', domainId: 3, isActive: false },
        })
        expect(queryClient.getQueryData(['inboundForms', 1])).toEqual(updated)
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        unmount()
    })

    it('updates a mounted detail query that was keyed with a getter', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'updateInboundForm').mockResolvedValue(updated)
        const { result, unmount } = withVueQuery(() => ({
            query: useQuery(useInboundFormQuery(() => 1)),
            mutation: useInboundFormUpdateMutation(),
        }))
        await vi.waitFor(() => expect(result.query.data.value).toEqual(detail))

        await result.mutation.mutateAsync({ inboundFormId: 1, update: { name: 'Support' } })

        expect(result.query.data.value).toEqual(updated)
        unmount()
    })

    it('leaves the cache untouched when the update fails', async () => {
        vi.spyOn(InboundFormApi, 'updateInboundForm').mockRejectedValue(new Error('Slug taken'))
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormUpdateMutation())
        queryClient.setQueryData(['inboundForms', 1], detail)

        await expect(result.mutateAsync({ inboundFormId: 1, update: { slug: 'taken' } })).rejects.toThrow('Slug taken')

        expect(queryClient.getQueryData(['inboundForms', 1])).toEqual(detail)
        unmount()
    })
})
