import { queryOptions } from '@tanstack/vue-query'
import { SetupApi } from 'api'

export function useSetupStatusQuery() {
    return queryOptions({
        queryKey: ['setup.status'],
        queryFn: () => SetupApi.getStatus(),
        staleTime: Infinity,
    })
}
