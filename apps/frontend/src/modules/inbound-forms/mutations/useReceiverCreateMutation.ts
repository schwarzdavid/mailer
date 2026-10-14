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
            return Promise.all([
                client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] }),
                client.invalidateQueries({ queryKey: ['inboundForms'], exact: true }),
                client.invalidateQueries({ queryKey: ['projects'] }),
            ])
        },
    })
}
