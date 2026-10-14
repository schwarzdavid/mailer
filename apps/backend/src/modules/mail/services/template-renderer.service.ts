import { Injectable } from '@nestjs/common'
import Handlebars from 'handlebars'

const LINE_BREAKS = /[\r\n\u0085\u2028\u2029]+/g

export class TemplateRenderError extends Error {
    override readonly name = 'TemplateRenderError'
}

@Injectable()
export class TemplateRendererService {
    render(template: string, context: Record<string, unknown>): string {
        return this.compile(template, context, false)
    }

    renderSubject(template: string, context: Record<string, unknown>): string {
        return this.compile(template, context, true).replace(LINE_BREAKS, ' ').trim()
    }

    private compile(template: string, context: Record<string, unknown>, noEscape: boolean): string {
        try {
            return Handlebars.compile(template, { noEscape })(context)
        } catch (error) {
            throw new TemplateRenderError(error instanceof Error ? error.message : 'Template rendering failed')
        }
    }

    assertValid(template: string): void {
        try {
            Handlebars.parse(template)
        } catch (error) {
            throw new TemplateRenderError(error instanceof Error ? error.message : 'Invalid template')
        }
    }
}
