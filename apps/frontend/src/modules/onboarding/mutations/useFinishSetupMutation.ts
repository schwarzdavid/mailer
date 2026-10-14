import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { SetupApi } from 'api'
import { waitAtleast } from '@/helper/waitAtleast.ts'

export function useFinishSetupMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: () => waitAtleast(SetupApi.finishSetup()),
        onSuccess(status) {
            client.setQueryData(['setup.status'], status)
        },
    })
}
