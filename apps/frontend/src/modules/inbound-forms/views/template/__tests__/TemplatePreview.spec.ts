import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import TemplatePreview from '../partials/TemplatePreview.vue'
import { mountView } from '@/__tests__/support.ts'

describe('TemplatePreview', () => {
    it('renders the template with the sample data into a sandboxed frame', () => {
        const wrapper = mountView(TemplatePreview, {
            props: { template: '<p>Hello {{firstName}}</p>', sampleData: { firstName: 'Ada' } },
        })

        const frame = wrapper.get('iframe')
        expect(frame.attributes('srcdoc')).toBe('<p>Hello Ada</p>')
        expect(frame.attributes('sandbox')).toBe('')
        expect(frame.attributes('title')).toBe('Preview')
    })

    it('escapes submitted values so they cannot inject markup', () => {
        const wrapper = mountView(TemplatePreview, {
            props: { template: '<p>{{message}}</p>', sampleData: { message: '<script>alert(1)</script>' } },
        })

        expect(wrapper.get('iframe').attributes('srcdoc')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    })

    it('shows a template error instead of the frame for invalid syntax', () => {
        const wrapper = mountView(TemplatePreview, {
            props: { template: '{{#if firstName}}unclosed', sampleData: { firstName: 'Ada' } },
        })

        expect(wrapper.find('iframe').exists()).toBe(false)
        expect(wrapper.text()).toContain('Template error:')
    })

    it('re-renders after the template changes', async () => {
        const template = ref('<p>{{firstName}}</p>')
        const host = defineComponent({
            setup: () => () => h(TemplatePreview, { template: template.value, sampleData: { firstName: 'Ada' } }),
        })
        const wrapper = mountView(host)

        template.value = '<h1>{{firstName}}</h1>'

        await vi.waitFor(() => {
            expect(wrapper.get('iframe').attributes('srcdoc')).toBe('<h1>Ada</h1>')
        })
    })
})
