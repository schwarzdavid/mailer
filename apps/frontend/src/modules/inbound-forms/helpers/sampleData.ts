import type { InboundFormFieldDto } from 'api'

export function buildSampleData(fields: InboundFormFieldDto[]): Record<string, unknown> {
    return Object.fromEntries(fields.map((field) => [field.key, sampleValue(field)]))
}

function sampleValue(field: InboundFormFieldDto): unknown {
    if (field.defaultValue) {
        if (field.type === 'number') {
            return Number(field.defaultValue)
        }
        if (field.type === 'boolean') {
            return field.defaultValue === 'true'
        }
        return field.defaultValue
    }

    switch (field.type) {
        case 'email':
            return 'jane.doe@example.com'
        case 'number':
            return 42
        case 'boolean':
            return true
        default:
            return `Sample ${field.label}`
    }
}
