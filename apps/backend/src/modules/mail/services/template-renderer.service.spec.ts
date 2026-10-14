import { describe, expect, it } from 'vitest'
import { TemplateRendererService, TemplateRenderError } from './template-renderer.service.js'

describe('TemplateRendererService', () => {
    const service = new TemplateRendererService()

    describe('render', () => {
        it('replaces placeholders with context values', () => {
            const result = service.render('<p>Hello {{firstName}}!</p>', { firstName: 'Max' })

            expect(result).toBe('<p>Hello Max!</p>')
        })

        it('escapes html in context values', () => {
            const result = service.render('{{comment}}', { comment: '<script>alert(1)</script>' })

            expect(result).not.toContain('<script>')
            expect(result).toContain('&lt;script&gt;')
        })

        it('renders missing values as empty strings', () => {
            const result = service.render('Hello {{missing}}!', {})

            expect(result).toBe('Hello !')
        })

        it('throws a TemplateRenderError for a broken template', () => {
            expect(() => service.render('{{#if}}', {})).toThrow(TemplateRenderError)
        })

        it('does not expose prototype properties of submitted data', () => {
            const result = service.render('[{{constructor}}][{{__proto__}}][{{data.constructor.name}}]', {
                data: { value: 1 },
            })

            expect(result).toBe('[][][]')
        })

        it('escapes quotes and ampersands so values cannot break out of attributes', () => {
            const result = service.render('<a title="{{name}}">x</a>', { name: '" onmouseover="alert(1)&' })

            expect(result).toBe('<a title="&quot; onmouseover&#x3D;&quot;alert(1)&amp;">x</a>')
        })
    })

    describe('renderSubject', () => {
        it('renders values verbatim instead of html-escaping them', () => {
            const result = service.renderSubject('Inquiry from {{company}}', { company: `O'Brien & Co <Ltd>` })

            expect(result).toBe(`Inquiry from O'Brien & Co <Ltd>`)
        })

        it('collapses line breaks so submitted values cannot inject headers', () => {
            const result = service.renderSubject('Hi {{name}}', { name: 'Max\r\nBcc: victim@example.com\n\u2028x' })

            expect(result).toBe('Hi Max Bcc: victim@example.com x')
            expect(result).not.toMatch(/[\r\n]/)
        })

        it('strips line breaks from the template itself', () => {
            expect(service.renderSubject('Hello\r\n{{name}}\n', { name: 'Max' })).toBe('Hello Max')
        })

        it('does not expose prototype properties of submitted data', () => {
            expect(service.renderSubject('[{{constructor}}][{{__proto__}}]', {})).toBe('[][]')
        })

        it('throws a TemplateRenderError for a broken template', () => {
            expect(() => service.renderSubject('{{#if}}', {})).toThrow(TemplateRenderError)
        })
    })

    describe('assertValid', () => {
        it('accepts a valid template', () => {
            expect(() => service.assertValid('Hi {{name}}')).not.toThrow()
        })

        it('throws a TemplateRenderError for unbalanced braces', () => {
            expect(() => service.assertValid('{{#each items}}')).toThrow(TemplateRenderError)
        })
    })
})
