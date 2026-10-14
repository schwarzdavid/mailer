import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeyApi } from 'api'
import { useApiKeyCreateMutation } from '../useApiKeyCreateMutation.ts'
import { useApiKeyRevokeMutation } from '../useApiKeyRevokeMutation.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { apiKeyCreated } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useApiKeyCreateMutation', () => {
    it('creates the key, returns it once and refreshes the key list', async () => {
        const created = apiKeyCreated()
        const createSpy = vi.spyOn(ApiKeyApi, 'createApiKey').mockResolvedValue(created)
        const { result, queryClient, unmount } = withVueQuery(() => useApiKeyCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ projectId: 1, name: 'Newsletter' })).resolves.toEqual(created)

        expect(createSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { name: 'Newsletter' } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 1, 'apiKeys'] })
        unmount()
    })

    it('drops the created key from the mutation cache once reset', async () => {
        const created = apiKeyCreated()
        vi.spyOn(ApiKeyApi, 'createApiKey').mockResolvedValue(created)
        const { result, queryClient, unmount } = withVueQuery(() => useApiKeyCreateMutation())

        await result.mutateAsync({ projectId: 1, name: 'Newsletter' })
        result.reset()

        await vi.waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
        expect(result.data.value).toBeUndefined()
        unmount()
    })

    it('does not refresh when creating fails', async () => {
        vi.spyOn(ApiKeyApi, 'createApiKey').mockRejectedValue(new Error('Forbidden'))
        const { result, queryClient, unmount } = withVueQuery(() => useApiKeyCreateMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await expect(result.mutateAsync({ projectId: 1, name: 'x' })).rejects.toThrow('Forbidden')

        expect(invalidateSpy).not.toHaveBeenCalled()
        unmount()
    })
})

describe('useApiKeyRevokeMutation', () => {
    it('revokes the key and refreshes the key list', async () => {
        const revokeSpy = vi.spyOn(ApiKeyApi, 'revokeApiKey').mockResolvedValue(undefined)
        const { result, queryClient, unmount } = withVueQuery(() => useApiKeyRevokeMutation())
        const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

        await result.mutateAsync({ projectId: 1, apiKeyId: 11 })

        expect(revokeSpy).toHaveBeenCalledWith({ path: { projectId: 1, apiKeyId: 11 } })
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 1, 'apiKeys'] })
        unmount()
    })
})
