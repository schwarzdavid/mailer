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
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
