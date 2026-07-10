import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { InboundFormApi, type InboundFormFieldUpsertDto } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useInboundFormFieldsMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: ({ inboundFormId, fields }: { inboundFormId: number; fields: InboundFormFieldUpsertDto[] }) =>
            waitAtleast(
                InboundFormApi.updateInboundFormFields({
                    path: { inboundFormId },
                    body: { fields },
                }),
            ),
        onSuccess(_fields, { inboundFormId }) {
            void client.invalidateQueries({ queryKey: ['inboundForms', inboundFormId] })
        },
    })
}
