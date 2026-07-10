import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormTemplateDraftDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useTemplateDraftMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({
            inboundFormId,
            inboundFormReceiverId,
            draft,
        }: {
            inboundFormId: number
            inboundFormReceiverId: number
            draft: InboundFormTemplateDraftDto
        }) =>
            waitAtleast(
                InboundFormApi.saveInboundFormTemplateDraft({
                    path: {
                        inboundFormId,
                        inboundFormReceiverId,
                    },
                    body: draft,
                }),
            ),
        onSuccess(_template, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
