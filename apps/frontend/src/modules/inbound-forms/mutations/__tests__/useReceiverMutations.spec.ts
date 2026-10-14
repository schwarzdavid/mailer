import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormReceiverDto } from 'api'
import { useReceiverCreateMutation } from '../useReceiverCreateMutation.ts'
import { useReceiverUpdateMutation } from '../useReceiverUpdateMutation.ts'
import { useReceiverDeleteMutation } from '../useReceiverDeleteMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const receiver: InboundFormReceiverDto = {
    inboundFormReceiverId: 31,
    emailFrom: 'noreply@mail.example.com',
    emailReceiver: 'owner@business.com',
    emailReplyTo: '{{email}}',
    isActive: true,
    draftVersion: null,
    publishedVersion: null,
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useReceiverCreateMutation', () => {
    it('creates the receiver on the form and refreshes the form', async () => {
        const createSpy = vi.spyOn(InboundFormApi, 'createInboundFormReceiver').mockResolvedValue(receiver)
        const { result, queryClient, unmount } = withVueQuery(() => useReceiverCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        const created = await result.mutateAsync({
            inboundFormId: 1,
            receiver: {
                emailFrom: 'noreply@mail.example.com',
                emailReceiver: 'owner@business.com',
                emailReplyTo: '{{email}}',
                isActive: true,
            },
        })

        expect(createSpy).toHaveBeenCalledWith({
            path: { inboundFormId: 1 },
            body: {
                emailFrom: 'noreply@mail.example.com',
                emailReceiver: 'owner@business.com',
                emailReplyTo: '{{email}}',
                isActive: true,
            },
        })
        expect(created).toEqual(receiver)
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inboundForms', 1] })
        unmount()
    })

    it('does not refresh the form when creation fails', async () => {
        vi.spyOn(InboundFormApi, 'createInboundFormReceiver').mockRejectedValue(new Error('Invalid sender'))
        const { result, queryClient, unmount } = withVueQuery(() => useReceiverCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(
            result.mutateAsync({
                inboundFormId: 1,
                receiver: { emailFrom: 'a@b.c', emailReceiver: 'd@e.f', emailReplyTo: null },
            }),
        ).rejects.toThrow('Invalid sender')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})

describe('useReceiverUpdateMutation', () => {
    it('updates the addressed receiver and refreshes the form', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormReceiver').mockResolvedValue({
            ...receiver,
            isActive: false,
        })
        const { result, queryClient, unmount } = withVueQuery(() => useReceiverUpdateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ inboundFormId: 1, inboundFormReceiverId: 31, update: { isActive: false } })

        expect(updateSpy).toHaveBeenCalledWith({
            path: { inboundFormId: 1, inboundFormReceiverId: 31 },
            body: { isActive: false },
        })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inboundForms', 1] })
        unmount()
    })
})

describe('useReceiverDeleteMutation', () => {
    it('deletes the addressed receiver and refreshes the form', async () => {
        const deleteSpy = vi.spyOn(InboundFormApi, 'deleteInboundFormReceiver').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useReceiverDeleteMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ inboundFormId: 1, inboundFormReceiverId: 31 })

        expect(deleteSpy).toHaveBeenCalledWith({ path: { inboundFormId: 1, inboundFormReceiverId: 31 } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inboundForms', 1] })
        unmount()
    })
})
