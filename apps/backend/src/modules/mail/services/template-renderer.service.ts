import { Injectable } from '@nestjs/common'
import Handlebars from 'handlebars'

export class TemplateRenderError extends Error {
    override readonly name = 'TemplateRenderError'
}

@Injectable()
export class TemplateRendererService {
    render(template: string, context: Record<string, unknown>): string {
        try {
            return Handlebars.compile(template)(context)
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
