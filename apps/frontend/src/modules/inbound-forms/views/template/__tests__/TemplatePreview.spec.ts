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

    it('renders the envelope with placeholders filled in', () => {
        const wrapper = mountView(TemplatePreview, {
            props: {
                template: '<p></p>',
                subject: 'Request from {{firstName}}',
                from: 'noreply@forms.acme.com',
                to: 'sales@acme.com',
                replyTo: '{{email}}',
                sampleData: { firstName: 'Ada', email: 'ada@example.com' },
            },
        })

        expect(wrapper.text()).toContain('Request from Ada')
        expect(wrapper.text()).toContain('noreply@forms.acme.com')
        expect(wrapper.text()).toContain('ada@example.com')
    })

    it('names the error line and keeps the last good render', async () => {
        const template = ref('<p>{{firstName}}</p>')
        const host = defineComponent({
            setup: () => () => h(TemplatePreview, { template: template.value, sampleData: { firstName: 'Ada' } }),
        })
        const wrapper = mountView(host)

        template.value = '<p>ok</p>\n{{#if firstName}unclosed'

        await vi.waitFor(() => expect(wrapper.text()).toContain('Template error on line 2'))
        expect(wrapper.get('iframe').attributes('srcdoc')).toBe('<p>Ada</p>')
        expect(wrapper.text()).toContain('Showing the last version that compiled.')
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
