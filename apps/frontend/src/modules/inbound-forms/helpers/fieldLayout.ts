import type { InboundFormFieldDto } from 'api'

export function fieldLayoutTemplate(formName: string, fields: Pick<InboundFormFieldDto, 'key' | 'label' | 'type'>[]) {
    const rows = fields.map((field) => {
        const value = field.type === 'boolean' ? `{{#if ${field.key}}}✓{{else}}–{{/if}}` : `{{${field.key}}}`
        return `    <tr><td style="padding: 6px 0; color: #666">${field.label}</td><td>${value}</td></tr>`
    })
    return [
        '<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #222">',
        `  <h2 style="margin-bottom: 4px">${formName}</h2>`,
        '  <table style="width: 100%; border-collapse: collapse">',
        ...rows,
        '  </table>',
        '</div>',
        '',
    ].join('\n')
}
