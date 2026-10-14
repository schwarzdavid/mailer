import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormFieldDto, type InboundFormFieldUpsertDto } from 'api'
import { useInboundFormFieldsMutation } from '../useInboundFormFieldsMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const fields: InboundFormFieldUpsertDto[] = [
    { key: 'email', label: 'Email', type: 'email', defaultValue: null, validation: { required: true } },
]

const saved: InboundFormFieldDto[] = [{ ...fields[0]!, inboundFormFieldId: 21 }]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormFieldsMutation', () => {
    it('replaces the field list and refreshes the form', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormFields').mockResolvedValue(saved)
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormFieldsMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ inboundFormId: 1, fields })

        expect(updateSpy).toHaveBeenCalledWith({ path: { inboundFormId: 1 }, body: { fields } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inboundForms', 1] })
        unmount()
    })

    it('does not refresh the form when saving fails', async () => {
        vi.spyOn(InboundFormApi, 'updateInboundFormFields').mockRejectedValue(new Error('Duplicate key'))
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormFieldsMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ inboundFormId: 1, fields })).rejects.toThrow('Duplicate key')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})
