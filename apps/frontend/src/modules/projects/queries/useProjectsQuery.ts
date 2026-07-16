import { queryOptions } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useProjectsQuery() {
    return queryOptions({
        queryKey: ['projects'],
        queryFn: () => ProjectApi.getProjects(),
    })
}
