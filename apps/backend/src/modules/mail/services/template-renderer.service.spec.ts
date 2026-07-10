import { describe, expect, it } from 'vitest'
import { TemplateRendererService, TemplateRenderError } from './template-renderer.service'

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
