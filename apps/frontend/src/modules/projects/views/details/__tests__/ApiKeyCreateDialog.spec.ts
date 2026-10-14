import { afterEach, describe, expect, it, vi } from 'vitest'
import { type MutationCache, QueryClient } from '@tanstack/vue-query'
import { ApiKeyApi } from 'api'
import ApiKeyCreateDialog from '../partials/ApiKeyCreateDialog.vue'
import { mountDialog, overlayText, setOverlayInput, submitOverlayForm } from '@/__tests__/support.ts'
import { apiKeyCreated, projectDetail } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))
vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('ApiKeyCreateDialog', () => {
    it('requires a name', async () => {
        const createSpy = vi.spyOn(ApiKeyApi, 'createApiKey')
        const { wrapper } = mountDialog(ApiKeyCreateDialog, { project: projectDetail() })
        await vi.waitFor(() => expect(overlayText()).toContain('New API key'))

        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Enter a name'))
        expect(createSpy).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('emits the created key and closes', async () => {
        const created = apiKeyCreated()
        const createSpy = vi.spyOn(ApiKeyApi, 'createApiKey').mockResolvedValue(created)
        const { wrapper, open } = mountDialog(ApiKeyCreateDialog, { project: projectDetail() })
        await vi.waitFor(() => expect(overlayText()).toContain('New API key'))

        await setOverlayInput('name', '  Newsletter  ')
        submitOverlayForm()

        await vi.waitFor(() => expect(open.value).toBe(false))
        expect(createSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { name: 'Newsletter' } })
        expect(wrapper.findComponent(ApiKeyCreateDialog).emitted('created')).toEqual([[created]])
    })

    it('keeps no copy of the created key in the mutation cache', async () => {
        const created = apiKeyCreated()
        vi.spyOn(ApiKeyApi, 'createApiKey').mockResolvedValue(created)
        const getMutationCache = vi.spyOn(QueryClient.prototype, 'getMutationCache')
        const { open } = mountDialog(ApiKeyCreateDialog, { project: projectDetail() })
        await vi.waitFor(() => expect(overlayText()).toContain('New API key'))

        await setOverlayInput('name', 'Newsletter')
        submitOverlayForm()

        await vi.waitFor(() => expect(open.value).toBe(false))
        const caches = new Set<MutationCache>(
            getMutationCache.mock.results.flatMap((result) => (result.type === 'return' ? [result.value] : [])),
        )
        expect(caches.size).toBeGreaterThan(0)
        await vi.waitFor(() => {
            const holdingKey = [...caches]
                .flatMap((cache) => cache.getAll())
                .filter((mutation) => JSON.stringify(mutation.state.data ?? null).includes(created.key))
            expect(holdingKey).toEqual([])
        })
    })

    it('shows the server error inside the dialog', async () => {
        vi.spyOn(ApiKeyApi, 'createApiKey').mockRejectedValue({ message: 'Missing project permission' })
        const { open } = mountDialog(ApiKeyCreateDialog, { project: projectDetail() })
        await vi.waitFor(() => expect(overlayText()).toContain('New API key'))

        await setOverlayInput('name', 'Newsletter')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Missing project permission'))
        expect(open.value).toBe(true)
    })
})
