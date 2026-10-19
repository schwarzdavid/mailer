import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import DisclosureBox from '../DisclosureBox.vue'
import { mountView } from '@/__tests__/support.ts'

function mountBox(props: { defaultOpen?: boolean } = {}) {
    return mountView(DisclosureBox, {
        props: { summary: 'Advanced', ...props },
        slots: { default: '<input name="inner" />' },
    })
}

describe('DisclosureBox', () => {
    it('starts collapsed and announces its state', () => {
        const wrapper = mountBox()
        const toggle = wrapper.get('button')

        expect(toggle.text()).toContain('Advanced')
        expect(toggle.attributes('aria-expanded')).toBe('false')
        expect(wrapper.find('input[name="inner"]').exists()).toBe(false)
    })

    it('expands on click and collapses again', async () => {
        const wrapper = mountBox()
        const toggle = wrapper.get('button')

        await toggle.trigger('click')
        await nextTick()
        expect(toggle.attributes('aria-expanded')).toBe('true')
        expect(toggle.attributes('aria-controls')).toBe(wrapper.get('.disclosure-box__content').attributes('id'))
        expect(wrapper.find('input[name="inner"]').exists()).toBe(true)

        await toggle.trigger('click')
        await nextTick()
        expect(toggle.attributes('aria-expanded')).toBe('false')
        expect(wrapper.find('input[name="inner"]').exists()).toBe(false)
    })

    it('can start open', () => {
        const wrapper = mountBox({ defaultOpen: true })

        expect(wrapper.find('input[name="inner"]').exists()).toBe(true)
    })
})
