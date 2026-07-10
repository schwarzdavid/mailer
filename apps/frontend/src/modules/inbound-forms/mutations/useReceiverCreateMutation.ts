import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormReceiverCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useReceiverCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ inboundFormId, receiver }: { inboundFormId: number; receiver: InboundFormReceiverCreateDto }) =>
            waitAtleast(
                InboundFormApi.createInboundFormReceiver({
                    path: { inboundFormId },
                    body: receiver,
                }),
            ),
        onSuccess(_receiver, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
