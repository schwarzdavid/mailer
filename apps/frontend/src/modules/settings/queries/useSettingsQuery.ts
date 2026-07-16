import { queryOptions } from '@tanstack/vue-query'
import { SettingsApi } from 'api'

export function useSettingsQuery() {
    return queryOptions({
        queryKey: ['settings'],
        queryFn: () => SettingsApi.getSettings(),
    })
}
