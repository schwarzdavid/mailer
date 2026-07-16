import { queryOptions } from '@tanstack/vue-query'
import { ProjectApi } from 'api'

export function useDeletedProjectsQuery() {
    return queryOptions({
        queryKey: ['projects.deleted'],
        queryFn: () => ProjectApi.getDeletedProjects(),
    })
}
