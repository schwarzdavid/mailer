import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { useClipboard } from '@vueuse/core'
import CopyField from '../CopyField.vue'
import { mountView } from '@/__tests__/support.ts'

type Clipboard = ReturnType<typeof useClipboard>

const clipboard = vi.hoisted(() => ({
    copy: vi.fn<Clipboard['copy']>(),
    copied: { value: false },
}))

vi.mock('@vueuse/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@vueuse/core')>()
    return {
        ...actual,
        useClipboard: () => ({ copy: clipboard.copy, copied: ref(clipboard.copied.value), isSupported: ref(true) }),
    }
})

afterEach(() => {
    clipboard.copy.mockReset()
    clipboard.copied.value = false
})

describe('CopyField', () => {
    it('shows the full value and copies it', async () => {
        const wrapper = mountView(CopyField, { props: { value: 'v=spf1 -all', label: 'host for SPF' } })

        expect(wrapper.text()).toContain('v=spf1 -all')
        await wrapper.get('button[aria-label="Copy host for SPF"]').trigger('click')

        expect(clipboard.copy).toHaveBeenCalledWith('v=spf1 -all')
    })

    it('masks secrets until revealed but copies the real value', async () => {
        const wrapper = mountView(CopyField, { props: { value: 'secret-key', label: 'secret', secret: true } })

        expect(wrapper.text()).not.toContain('secret-key')
        await wrapper.get('button[aria-label="Copy secret"]').trigger('click')
        expect(clipboard.copy).toHaveBeenCalledWith('secret-key')

        await wrapper.get('button[aria-label="Show secret"]').trigger('click')
        expect(wrapper.text()).toContain('secret-key')
    })

    it('toggles a clamped value', async () => {
        const wrapper = mountView(CopyField, { props: { value: 'p=MIIB', label: 'value for DKIM', clamp: true } })

        expect(wrapper.find('.copy-field__value--clamped').exists()).toBe(true)
        await wrapper.get('.copy-field__more').trigger('click')

        expect(wrapper.find('.copy-field__value--clamped').exists()).toBe(false)
        expect(wrapper.get('.copy-field__more').text()).toBe('Show less')
    })
})
