import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type SendingDomainDto } from 'api'
import { useSendingDomainRefreshMutation } from '../useSendingDomainRefreshMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const sendingDomain: SendingDomainDto = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    lastCheckedAt: null,
    records: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useSendingDomainRefreshMutation', () => {
    it('sends the refresh request to SettingsApi.refreshSendingDomain', async () => {
        const refreshSpy = vi.spyOn(SettingsApi, 'refreshSendingDomain').mockResolvedValue(sendingDomain)
        const { result, unmount } = withVueQuery(() => useSendingDomainRefreshMutation())

        await result.mutateAsync()

        expect(refreshSpy).toHaveBeenCalled()
        unmount()
    })

    it('writes the sending domain into the settings cache on success', async () => {
        vi.spyOn(SettingsApi, 'refreshSendingDomain').mockResolvedValue(sendingDomain)
        const { result, queryClient, unmount } = withVueQuery(() => useSendingDomainRefreshMutation())

        await result.mutateAsync()

        expect(queryClient.getQueryData(['settings'])).toEqual({ sendingDomain })
        unmount()
    })
})
