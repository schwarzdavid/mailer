import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormTemplateDto } from 'api'
import { useTemplateDraftMutation } from '../useTemplateDraftMutation.ts'
import { useTemplatePublishMutation } from '../useTemplatePublishMutation.ts'
import { useInboundFormTemplatesQuery } from '@/modules/inbound-forms/queries/useInboundFormTemplatesQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const draft: InboundFormTemplateDto = {
    inboundFormTemplateId: 42,
    inboundFormReceiverId: 31,
    subject: 'Hello {{name}}',
    template: '<p>{{name}}</p>',
    status: 'draft',
    version: 2,
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
}

const published: InboundFormTemplateDto = { ...draft, status: 'published' }

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useTemplateDraftMutation', () => {
    it('saves the draft for the receiver and refreshes the form', async () => {
        const saveSpy = vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockResolvedValue(draft)
        const { result, queryClient, unmount } = withVueQuery(() => useTemplateDraftMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({
            inboundFormId: 1,
            inboundFormReceiverId: 31,
            draft: { subject: 'Hello {{name}}', template: '<p>{{name}}</p>' },
        })

        expect(saveSpy).toHaveBeenCalledWith({
            path: { inboundFormId: 1, inboundFormReceiverId: 31 },
            body: { subject: 'Hello {{name}}', template: '<p>{{name}}</p>' },
        })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inboundForms', 1] })
        unmount()
    })

    it('refetches the mounted template versions of that form', async () => {
        const listSpy = vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft])
        vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockResolvedValue(draft)
        const { result, unmount } = withVueQuery(() => ({
            versions: useQuery(useInboundFormTemplatesQuery(1, 31)),
            mutation: useTemplateDraftMutation(),
        }))
        await vi.waitFor(() => expect(result.versions.isSuccess.value).toBe(true))

        await result.mutation.mutateAsync({
            inboundFormId: 1,
            inboundFormReceiverId: 31,
            draft: { subject: 'x', template: 'y' },
        })

        await vi.waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2))
        unmount()
    })
})

describe('useTemplatePublishMutation', () => {
    it('publishes the receiver template and refreshes the form', async () => {
        const publishSpy = vi.spyOn(InboundFormApi, 'publishInboundFormTemplate').mockResolvedValue(published)
        const { result, queryClient, unmount } = withVueQuery(() => useTemplatePublishMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        const template = await result.mutateAsync({ inboundFormId: 1, inboundFormReceiverId: 31 })

        expect(publishSpy).toHaveBeenCalledWith({ path: { inboundFormId: 1, inboundFormReceiverId: 31 } })
        expect(template).toEqual(published)
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inboundForms', 1] })
        unmount()
    })

    it('does not refresh the form when publishing fails', async () => {
        vi.spyOn(InboundFormApi, 'publishInboundFormTemplate').mockRejectedValue(new Error('No draft'))
        const { result, queryClient, unmount } = withVueQuery(() => useTemplatePublishMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ inboundFormId: 1, inboundFormReceiverId: 31 })).rejects.toThrow('No draft')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})
