import type { InboundFormFieldDto, InboundFormSecurityDto } from 'api'

function fieldMarkup(field: Pick<InboundFormFieldDto, 'key' | 'type' | 'validation'>): string {
    const required = field.validation?.required ? ' required' : ''
    switch (field.type) {
        case 'email':
            return `  <input name="${field.key}" type="email"${required}>`
        case 'number':
            return `  <input name="${field.key}" type="number"${required}>`
        case 'boolean':
            return `  <input name="${field.key}" type="checkbox" value="true"${required}>`
        default:
            return (field.validation?.maxLength ?? 0) > 255
                ? `  <textarea name="${field.key}"${required}></textarea>`
                : `  <input name="${field.key}"${required}>`
    }
}

export function exampleForm(
    endpoint: string,
    fields: Pick<InboundFormFieldDto, 'key' | 'type' | 'validation'>[],
    security: Pick<InboundFormSecurityDto, 'type' | 'location' | 'key'>[],
    submitLabel: string,
): string {
    const honeypots = security
        .filter((check) => check.type === 'honeypot' && check.location === 'body')
        .map((check) => `  <input name="${check.key}" tabindex="-1" autocomplete="off" hidden>`)
    return [
        `<form action="${endpoint}" method="post">`,
        ...fields.map(fieldMarkup),
        ...honeypots,
        `  <button>${submitLabel}</button>`,
        '</form>',
    ].join('\n')
}
