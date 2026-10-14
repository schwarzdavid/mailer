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
            return Promise.all([
                client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] }),
                client.invalidateQueries({ queryKey: ['inboundForms'], exact: true }),
                client.invalidateQueries({ queryKey: ['projects'] }),
            ])
        },
    })
}
