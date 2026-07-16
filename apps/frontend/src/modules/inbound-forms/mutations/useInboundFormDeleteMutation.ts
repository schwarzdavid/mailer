import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormDeleteMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (inboundFormId: number) =>
            waitAtleast(InboundFormApi.deleteInboundForm({ path: { inboundFormId } })),
        onSuccess(_result, inboundFormId) {
            client.removeQueries({ queryKey: ['inboundForms', inboundFormId] })
            void client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
