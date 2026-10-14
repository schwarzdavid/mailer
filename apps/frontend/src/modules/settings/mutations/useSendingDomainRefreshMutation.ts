import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { SettingsApi, type SettingsDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useSendingDomainRefreshMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: () => waitAtleast(SettingsApi.refreshSendingDomain()),
        onSuccess(sendingDomain) {
            client.setQueryData(['settings'], { sendingDomain } satisfies SettingsDto)
        },
    })
}
