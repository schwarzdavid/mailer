import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { SettingsApi, type SendingDomainProposalDto } from 'api'
import { useSendingDomainProposalQuery } from '../useSendingDomainProposalQuery.ts'

const proposal: SendingDomainProposalDto = { fqdn: 'mx.example.com', serverIpv4: '203.0.113.10', serverIpv6: null }

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useSendingDomainProposalQuery', () => {
    it('loads the proposed sending domain', async () => {
        const getProposal = vi.spyOn(SettingsApi, 'getSendingDomainProposal').mockResolvedValue(proposal)
        const options = useSendingDomainProposalQuery()

        await expect(new QueryClient().fetchQuery(options)).resolves.toEqual(proposal)
        expect(options.queryKey).toEqual(['settings.sendingDomainProposal'])
        expect(getProposal).toHaveBeenCalledTimes(1)
    })
})
