import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormDetailDto, type InboundFormTemplateDto } from 'api'
import { useInboundFormQuery } from '../useInboundFormQuery.ts'
import { useInboundFormTemplatesQuery } from '../useInboundFormTemplatesQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

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

const template: InboundFormTemplateDto = {
    inboundFormTemplateId: 42,
    inboundFormReceiverId: 31,
    subject: 'Hello',
    template: '<p>Hi</p>',
    status: 'draft',
    version: 1,
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormQuery', () => {
    it('loads the form detail under its id key', async () => {
        const getSpy = vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useInboundFormQuery(1)))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(getSpy).toHaveBeenCalledWith({ path: { inboundFormId: 1 } })
        expect(result.data.value).toEqual(detail)
        expect(queryClient.getQueryData(['inboundForms', 1])).toEqual(detail)
        unmount()
    })

    it('refetches when the reactive id changes', async () => {
        const getSpy = vi
            .spyOn(InboundFormApi, 'getInboundForm')
            .mockImplementation(({ path }) => Promise.resolve({ ...detail, inboundFormId: path.inboundFormId }))
        const inboundFormId = ref(1)
        const { result, unmount } = withVueQuery(() => useQuery(useInboundFormQuery(inboundFormId)))
        await vi.waitFor(() => expect(result.data.value?.inboundFormId).toBe(1))

        inboundFormId.value = 2

        await vi.waitFor(() => expect(result.data.value?.inboundFormId).toBe(2))
        expect(getSpy).toHaveBeenLastCalledWith({ path: { inboundFormId: 2 } })
        unmount()
    })

    it('surfaces api failures as query errors', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockRejectedValue(new Error('Not found'))
        const { result, unmount } = withVueQuery(() => useQuery(useInboundFormQuery(1)))

        await vi.waitFor(() => expect(result.isError.value).toBe(true))

        expect(result.error.value?.message).toBe('Not found')
        unmount()
    })
})

describe('useInboundFormTemplatesQuery', () => {
    it('loads the receiver templates nested under the form key', async () => {
        const listSpy = vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([template])
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useInboundFormTemplatesQuery(1, 31)))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledWith({ path: { inboundFormId: 1, inboundFormReceiverId: 31 } })
        expect(queryClient.getQueryData(['inboundForms', 1, 'templates', 31])).toEqual([template])
        unmount()
    })
})
