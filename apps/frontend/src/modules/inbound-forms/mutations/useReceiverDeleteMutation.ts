import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useReceiverDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            inboundFormReceiverId,
        }: {
            inboundFormId: number
            inboundFormReceiverId: number
        }) =>
            waitAtleast(
                InboundFormApi.deleteInboundFormReceiver({
                    path: {
                        inboundFormId,
                        inboundFormReceiverId,
                    },
                }),
            ),
        onSuccess(_result, { inboundFormId }) {
            return Promise.all([
                client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] }),
                client.invalidateQueries({ queryKey: ['inboundForms'], exact: true }),
                client.invalidateQueries({ queryKey: ['projects'] }),
            ])
        },
    })
}
