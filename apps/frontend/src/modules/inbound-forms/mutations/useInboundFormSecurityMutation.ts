import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormSecurityUpsertDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormSecurityMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            security,
        }: {
            inboundFormId: number
            security: InboundFormSecurityUpsertDto[]
        }) =>
            waitAtleast(
                InboundFormApi.updateInboundFormSecurity({
                    path: { inboundFormId },
                    body: { security },
                }),
            ),
        onSuccess(_security, { inboundFormId }) {
            return Promise.all([
                client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] }),
                client.invalidateQueries({ queryKey: ['inboundForms'], exact: true }),
                client.invalidateQueries({ queryKey: ['projects'] }),
            ])
        },
    })
}
