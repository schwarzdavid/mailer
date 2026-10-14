import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/vue-query'
import { SetupApi } from 'api'
import { useSetupStatusQuery } from '../useSetupStatusQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useSetupStatusQuery', () => {
    it('loads the setup status under the setup.status key', async () => {
        const statusSpy = vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: true })
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useSetupStatusQuery()))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(statusSpy).toHaveBeenCalledOnce()
        expect(queryClient.getQueryData(['setup.status'])).toEqual({ needsSetup: true })
        unmount()
    })

    it('never refetches once known, so route guards do not hit the api on every navigation', async () => {
        const statusSpy = vi.spyOn(SetupApi, 'getStatus').mockResolvedValue({ needsSetup: false })
        const { queryClient, unmount } = withVueQuery(() => null)

        await queryClient.fetchQuery(useSetupStatusQuery())
        await queryClient.fetchQuery(useSetupStatusQuery())

        expect(statusSpy).toHaveBeenCalledOnce()
        unmount()
    })
})
