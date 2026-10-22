import { queryOptions } from '@tanstack/vue-query'
import { SettingsApi } from 'api'

export function useSendingDomainProposalQuery() {
    return queryOptions({
        queryKey: ['settings.sendingDomainProposal'],
        queryFn: () => SettingsApi.getSendingDomainProposal(),
    })
}
