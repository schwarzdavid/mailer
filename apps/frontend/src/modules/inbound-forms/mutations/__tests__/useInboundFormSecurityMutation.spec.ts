import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormSecurityDto, type InboundFormSecurityUpsertDto } from 'api'
import { useInboundFormSecurityMutation } from '../useInboundFormSecurityMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const security: InboundFormSecurityUpsertDto[] = [
    {
        type: 'google-recaptcha',
        location: 'body',
        key: 'g-recaptcha-response',
        config: { secret: 's3cret', minScore: 0.5, expectedAction: 'contact' },
    },
    {
        type: 'timed-token',
        location: 'body',
        key: 'formToken',
        config: { minDelaySeconds: 3, maxAgeSeconds: 3600 },
    },
]

const saved: InboundFormSecurityDto[] = [
    {
        inboundFormSecurityId: 11,
        type: 'google-recaptcha',
        location: 'body',
        key: 'g-recaptcha-response',
        config: { hasSecret: true, minScore: 0.5, expectedAction: 'contact' },
    },
    {
        inboundFormSecurityId: 12,
        type: 'timed-token',
        location: 'body',
        key: 'formToken',
        config: { minDelaySeconds: 3, maxAgeSeconds: 3600 },
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useInboundFormSecurityMutation', () => {
    it('replaces the security schemes and refreshes the form', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormSecurity').mockResolvedValue(saved)
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormSecurityMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ inboundFormId: 1, security })

        expect(updateSpy).toHaveBeenCalledWith({ path: { inboundFormId: 1 }, body: { security } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inboundForms', 1] })
        unmount()
    })

    it('does not refresh the form when saving fails', async () => {
        vi.spyOn(InboundFormApi, 'updateInboundFormSecurity').mockRejectedValue(new Error('Bad request'))
        const { result, queryClient, unmount } = withVueQuery(() => useInboundFormSecurityMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ inboundFormId: 1, security })).rejects.toThrow('Bad request')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})
