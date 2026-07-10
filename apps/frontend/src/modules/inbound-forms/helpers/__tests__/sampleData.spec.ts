import { describe, expect, it } from 'vitest'
import type { InboundFormFieldDto } from 'api'
import { buildSampleData } from '../sampleData.ts'

function field(partial: Partial<InboundFormFieldDto>): InboundFormFieldDto {
    return {
        inboundFormFieldId: 1,
        key: 'field',
        label: 'Field',
        type: 'text',
        defaultValue: null,
        validation: null,
        ...partial,
    }
}

describe('buildSampleData', () => {
    it('generates a typed sample value per field', () => {
        const result = buildSampleData([
            field({ key: 'firstName', label: 'First name', type: 'text' }),
            field({ key: 'email', type: 'email' }),
            field({ key: 'guests', type: 'number' }),
            field({ key: 'newsletter', type: 'boolean' }),
        ])

        expect(result).toEqual({
            firstName: 'Sample First name',
            email: 'jane.doe@example.com',
            guests: 42,
            newsletter: true,
        })
    })

    it('prefers configured default values with type casting', () => {
        const result = buildSampleData([
            field({ key: 'source', type: 'text', defaultValue: 'website' }),
            field({ key: 'guests', type: 'number', defaultValue: '3' }),
            field({ key: 'newsletter', type: 'boolean', defaultValue: 'false' }),
        ])

        expect(result).toEqual({ source: 'website', guests: 3, newsletter: false })
    })
})
