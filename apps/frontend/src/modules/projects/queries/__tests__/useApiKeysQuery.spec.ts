import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'
import { useApiKeysQuery } from '../useApiKeysQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { apiKey } from '@/__tests__/fixtures.ts'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useApiKeysQuery', () => {
    it('loads the keys nested under the project key', async () => {
        const keys = [apiKey()]
        const listSpy = vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue(keys)
        const { result, queryClient, unmount } = withVueQuery(() => useQuery(useApiKeysQuery(1)))

        await vi.waitFor(() => expect(result.isSuccess.value).toBe(true))

        expect(listSpy).toHaveBeenCalledWith({ path: { projectId: 1 } })
        expect(queryClient.getQueryData(['projects', 1, 'apiKeys'])).toEqual(keys)
        unmount()
    })
})
