import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ inboundFormId, update }: { inboundFormId: number; update: InboundFormUpdateDto }) =>
            waitAtleast(
                InboundFormApi.updateInboundForm({
                    path: { inboundFormId },
                    body: update,
                }),
            ),
        onSuccess(detail, { inboundFormId }) {
            client.setQueryData(['inboundForms', inboundFormId], detail)
            void client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
