import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormDto } from 'api'
import { useInboundFormCreateMutation } from '../useInboundFormCreateMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

const form: InboundFormDto = {
    inboundFormId: 1,
    projectId: 5,
    domainId: 3,
    name: 'Contact',
    formKey: 'Xk3_a-9QpLm2Zr7Tb1Wv0c',
    isActive: true,
    allowedHostnames: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormCreateMutation', () => {
    it('creates the form and invalidates the list', async () => {
        const createSpy = vi.spyOn(InboundFormApi, 'createInboundForm').mockResolvedValue(form)
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        const created = await result.mutateAsync({ name: 'Contact', domainId: 3, projectId: 5 })

        expect(createSpy).toHaveBeenCalledWith({
            body: { name: 'Contact', domainId: 3, projectId: 5 },
        })
        expect(created).toEqual(form)
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] })
        unmount()
    })
})
