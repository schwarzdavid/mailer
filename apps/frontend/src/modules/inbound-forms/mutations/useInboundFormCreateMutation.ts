import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormCreateDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormCreateMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (body: InboundFormCreateDto) => waitAtleast(InboundFormApi.createInboundForm({ body })),
        onSuccess() {
            void client.invalidateQueries({ queryKey: ['projects'] })
        },
    })
}
