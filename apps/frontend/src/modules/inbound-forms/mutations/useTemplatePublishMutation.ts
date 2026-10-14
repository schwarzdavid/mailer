import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useTemplatePublishMutation() {
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
                InboundFormApi.publishInboundFormTemplate({
                    path: {
                        inboundFormId,
                        inboundFormReceiverId,
                    },
                }),
            ),
        onSuccess(_template, { inboundFormId }) {
            return Promise.all([
                client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] }),
                client.invalidateQueries({ queryKey: ['inboundForms'], exact: true }),
                client.invalidateQueries({ queryKey: ['projects'] }),
            ])
        },
    })
}
