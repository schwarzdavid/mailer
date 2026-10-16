import { describe, expect, it } from 'vitest'
import TablePagerFooter from '../TablePagerFooter.vue'
import { mountView } from '@/__tests__/support.ts'
import type { PageRange } from '@/composables/usePagedServerTable.ts'

function mountFooter(page: number, range: PageRange) {
    return mountView(TablePagerFooter, { props: { page, range } })
}

describe('TablePagerFooter', () => {
    it('formats every part of the range for the locale', () => {
        const wrapper = mountFooter(41, { from: 1001, to: 1025, total: 1234 })

        expect(wrapper.get('.table-footer').text()).toContain('1,001–1,025 of 1,234')
    })

    it('moves to the neighbouring pages', async () => {
        const wrapper = mountFooter(2, { from: 26, to: 50, total: 80 })

        await wrapper.get('button[aria-label="Previous page"]').trigger('click')
        await wrapper.get('button[aria-label="Next page"]').trigger('click')

        expect(wrapper.emitted('update:page')).toEqual([[1], [3]])
    })

    it('disables previous on the first page and next on the last', () => {
        const first = mountFooter(1, { from: 1, to: 25, total: 30 })
        expect(first.get('button[aria-label="Previous page"]').attributes('disabled')).toBeDefined()
        expect(first.get('button[aria-label="Next page"]').attributes('disabled')).toBeUndefined()

        const last = mountFooter(2, { from: 26, to: 30, total: 30 })
        expect(last.get('button[aria-label="Previous page"]').attributes('disabled')).toBeUndefined()
        expect(last.get('button[aria-label="Next page"]').attributes('disabled')).toBeDefined()
    })

    it('renders nothing for an empty table', () => {
        const wrapper = mountFooter(1, { from: 0, to: 0, total: 0 })

        expect(wrapper.find('.table-footer').exists()).toBe(false)
    })
})
