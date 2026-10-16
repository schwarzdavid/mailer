import { computed, ref, toValue, watch, type MaybeRefOrGetter, type WatchSource } from 'vue'
import { refDebounced } from '@vueuse/core'

const ITEMS_PER_PAGE = 25
const SEARCH_DEBOUNCE_MS = 300

export interface PageRange {
    from: number
    to: number
    total: number
}

export interface PagedServerTableOptions {
    total: MaybeRefOrGetter<number | undefined>
    resetPageOn?: WatchSource[]
    resetFilters?: () => void
}

export function usePagedServerTable({ total, resetPageOn = [], resetFilters }: PagedServerTableOptions) {
    const search = ref<string | null>('')
    const debouncedSearch = refDebounced(search, SEARCH_DEBOUNCE_MS)
    const page = ref(1)

    const range = computed<PageRange>(() => {
        const count = toValue(total) ?? 0
        return {
            from: count === 0 ? 0 : (page.value - 1) * ITEMS_PER_PAGE + 1,
            to: Math.min(page.value * ITEMS_PER_PAGE, count),
            total: count,
        }
    })

    watch([debouncedSearch, ...resetPageOn], () => {
        page.value = 1
    })

    function clearFilters() {
        search.value = ''
        resetFilters?.()
    }

    return { search, debouncedSearch, page, itemsPerPage: ITEMS_PER_PAGE, range, clearFilters }
}
