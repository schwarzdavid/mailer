import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsApi, type SendingDomainConfigureDto, type SendingDomainDto } from 'api'
import { useSendingDomainMutation } from '../useSendingDomainMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const config: SendingDomainConfigureDto = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
}

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

describe('useSendingDomainMutation', () => {
    it('sends the configuration to SettingsApi.configureSendingDomain', async () => {
        const configureSpy = vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue(sendingDomain)
        const { result, unmount } = withVueQuery(() => useSendingDomainMutation())

        await result.mutateAsync(config)

        expect(configureSpy).toHaveBeenCalledWith({ body: config })
        unmount()
    })

    it('writes the sending domain into the settings cache on success', async () => {
        vi.spyOn(SettingsApi, 'configureSendingDomain').mockResolvedValue(sendingDomain)
        const { result, queryClient, unmount } = withVueQuery(() => useSendingDomainMutation())

        await result.mutateAsync(config)

        expect(queryClient.getQueryData(['settings'])).toEqual({ sendingDomain })
        unmount()
    })
})
