import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormReceiverUpdateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useReceiverUpdateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            inboundFormReceiverId,
            update,
        }: {
            inboundFormId: number
            inboundFormReceiverId: number
            update: InboundFormReceiverUpdateDto
        }) =>
            waitAtleast(
                InboundFormApi.updateInboundFormReceiver({
                    path: {
                        inboundFormId,
                        inboundFormReceiverId,
                    },
                    body: update,
                }),
            ),
        onSuccess(_receiver, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
