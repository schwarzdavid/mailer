import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { usePagedServerTable } from '../usePagedServerTable.ts'

let scope: EffectScope

beforeEach(() => {
    vi.useFakeTimers()
    scope = effectScope()
})

afterEach(() => {
    scope.stop()
    vi.useRealTimers()
})

function setup(total: () => number | undefined = () => 0, filter = ref('all')) {
    const table = scope.run(() =>
        usePagedServerTable({
            total,
            resetPageOn: [filter],
            resetFilters: () => {
                filter.value = 'all'
            },
        }),
    )!
    return { ...table, filter }
}

describe('usePagedServerTable', () => {
    it('starts on the first page with an empty search and 25 rows per page', () => {
        const { page, search, debouncedSearch, itemsPerPage } = setup()

        expect(page.value).toBe(1)
        expect(search.value).toBe('')
        expect(debouncedSearch.value).toBe('')
        expect(itemsPerPage).toBe(25)
    })

    it('debounces the search by 300 ms', async () => {
        const { search, debouncedSearch } = setup()

        search.value = 'acme'
        await nextTick()
        vi.advanceTimersByTime(299)
        expect(debouncedSearch.value).toBe('')

        vi.advanceTimersByTime(1)
        expect(debouncedSearch.value).toBe('acme')
    })

    it('returns to the first page when the debounced search changes', async () => {
        const { search, page } = setup()
        page.value = 3

        search.value = 'acme'
        await nextTick()
        expect(page.value).toBe(3)

        vi.advanceTimersByTime(300)
        await nextTick()
        expect(page.value).toBe(1)
    })

    it('returns to the first page when a filter changes', async () => {
        const { filter, page } = setup()
        page.value = 4

        filter.value = 'failed'
        await nextTick()

        expect(page.value).toBe(1)
    })

    it('clears the search and the caller’s filters and returns to the first page', async () => {
        const { search, filter, page, clearFilters } = setup()
        search.value = 'acme'
        filter.value = 'failed'
        vi.advanceTimersByTime(300)
        await nextTick()
        page.value = 3

        clearFilters()
        vi.advanceTimersByTime(300)
        await nextTick()

        expect(search.value).toBe('')
        expect(filter.value).toBe('all')
        expect(page.value).toBe(1)
    })

    it('returns to the first page when an array source is replaced', async () => {
        const sortBy = ref([{ key: 'receivedAt', order: 'desc' }])
        const { page } = scope.run(() => usePagedServerTable({ total: () => 0, resetPageOn: [sortBy] }))!
        page.value = 5

        sortBy.value = [{ key: 'type', order: 'asc' }]
        await nextTick()

        expect(page.value).toBe(1)
    })

    it('describes the visible range of the current page', () => {
        const total = ref<number | undefined>(1234)
        const { page, range } = setup(() => total.value)

        expect(range.value).toEqual({ from: 1, to: 25, total: 1234 })

        page.value = 41
        expect(range.value).toEqual({ from: 1001, to: 1025, total: 1234 })

        page.value = 50
        expect(range.value).toEqual({ from: 1226, to: 1234, total: 1234 })
    })

    it('reports an empty range before data arrives', () => {
        const { range } = setup(() => undefined)

        expect(range.value).toEqual({ from: 0, to: 0, total: 0 })
    })
})
