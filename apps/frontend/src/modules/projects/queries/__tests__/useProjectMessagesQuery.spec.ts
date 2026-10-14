import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { MailMessageApi } from 'api'
import { useProjectMessagesQuery, type ProjectMessageQuery } from '../useProjectMessagesQuery.ts'
import { withVueQuery } from '@/__tests__/support.ts'
import { mailMessage } from '@/__tests__/fixtures.ts'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useProjectMessagesQuery', () => {
    it('requests the given page and filters for the project', async () => {
        const page = { items: [mailMessage()], total: 1 }
        const getSpy = vi.spyOn(MailMessageApi, 'getProjectMessages').mockResolvedValue(page)
        const query: ProjectMessageQuery = { page: 2, itemsPerPage: 25, status: 'failed' }
        const { result, unmount } = withVueQuery(() => useQuery(useProjectMessagesQuery(1, query)))

        await vi.waitFor(() => expect(result.data.value).toEqual(page))

        expect(getSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, query })
        unmount()
    })

    it('keeps the previous page visible while the next one loads', async () => {
        const getSpy = vi
            .spyOn(MailMessageApi, 'getProjectMessages')
            .mockResolvedValueOnce({ items: [mailMessage()], total: 30 })
            .mockReturnValueOnce(new Promise(() => undefined))
        const query = ref<ProjectMessageQuery>({ page: 1, itemsPerPage: 25 })
        const { result, unmount } = withVueQuery(() => useQuery(useProjectMessagesQuery(1, query)))
        await vi.waitFor(() => expect(result.data.value?.total).toBe(30))

        query.value = { page: 2, itemsPerPage: 25 }

        await vi.waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2))
        expect(result.data.value?.total).toBe(30)
        unmount()
    })
})
