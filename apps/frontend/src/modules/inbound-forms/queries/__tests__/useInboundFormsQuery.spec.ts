import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormDto } from 'api'
import { useQuery } from '@tanstack/vue-query'
import { useInboundFormsQuery } from '../useInboundFormsQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const form: InboundFormDto = {
    inboundFormId: 1,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormsQuery', () => {
    it('loads the forms and exposes them under the inboundForms key', async () => {
        const listSpy = vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([form])
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useInboundFormsQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledOnce()
        expect(result.data.value).toEqual([form])
        expect(queryClient.getQueryData(['inboundForms'])).toEqual([form])
        unmount()
    })
})
