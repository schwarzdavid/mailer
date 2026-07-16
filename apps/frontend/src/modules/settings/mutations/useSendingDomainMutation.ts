import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { SettingsApi, type SendingDomainConfigureDto, type SettingsDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useSendingDomainMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (config: SendingDomainConfigureDto) =>
            waitAtleast(
                SettingsApi.configureSendingDomain({
                    body: config,
                }),
            ),
        onSuccess(sendingDomain) {
            client.setQueryData(['settings'], { sendingDomain } satisfies SettingsDto)
        },
    })
}
