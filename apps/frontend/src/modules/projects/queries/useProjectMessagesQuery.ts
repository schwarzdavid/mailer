import { type MaybeRefOrGetter, toValue } from 'vue'
import { keepPreviousData, queryOptions } from '@tanstack/vue-query'
import { MailMessageApi, type GetProjectMessagesData } from 'api'

export type ProjectMessageQuery = NonNullable<GetProjectMessagesData['query']>

export function useProjectMessagesQuery(
    projectId: MaybeRefOrGetter<number>,
    query: MaybeRefOrGetter<ProjectMessageQuery> = {},
) {
    return queryOptions({
        queryKey: ['projects', projectId, 'messages', query],
        queryFn: () =>
            MailMessageApi.getProjectMessages({
                path: { projectId: toValue(projectId) },
                query: toValue(query),
            }),
        placeholderData: keepPreviousData,
    })
}
