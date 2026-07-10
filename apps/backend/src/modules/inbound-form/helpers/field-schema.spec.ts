import { describe, expect, it } from 'vitest'
import { buildDataSchema } from './field-schema'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldValidation,
} from '../interfaces/inbound-form-field.interface'

function field(
    key: string,
    type: InboundFormFieldType,
    validation: InboundFormFieldValidation | null = null,
    defaultValue: string | null = null,
): InboundFormField {
    return {
        inboundFormFieldId: 1,
        inboundFormId: 1,
        key,
        label: key,
        type,
        defaultValue,
        validation,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}

describe('buildDataSchema', () => {
    it('accepts a valid payload and strips unknown keys', () => {
        const schema = buildDataSchema([
            field('firstName', InboundFormFieldType.TEXT, { required: true }),
            field('email', InboundFormFieldType.EMAIL, { required: true }),
        ])

        const result = schema.parse({ firstName: 'Max', email: 'max@example.com', hacker: 'x' })

        expect(result).toEqual({ firstName: 'Max', email: 'max@example.com' })
    })

    it('rejects a missing required field', () => {
        const schema = buildDataSchema([field('email', InboundFormFieldType.EMAIL, { required: true })])

        expect(schema.safeParse({}).success).toBe(false)
    })

    it('allows omitting optional fields', () => {
        const schema = buildDataSchema([field('phone', InboundFormFieldType.TEXT)])

        expect(schema.safeParse({}).success).toBe(true)
    })

    it('rejects an invalid email', () => {
        const schema = buildDataSchema([field('email', InboundFormFieldType.EMAIL, { required: true })])

        expect(schema.safeParse({ email: 'not-an-email' }).success).toBe(false)
    })

    it('enforces string length and pattern constraints', () => {
        const schema = buildDataSchema([
            field('code', InboundFormFieldType.TEXT, {
                required: true,
                minLength: 2,
                maxLength: 4,
                pattern: '^[A-Z]+$',
            }),
        ])

        expect(schema.safeParse({ code: 'AB' }).success).toBe(true)
        expect(schema.safeParse({ code: 'A' }).success).toBe(false)
        expect(schema.safeParse({ code: 'ABCDE' }).success).toBe(false)
        expect(schema.safeParse({ code: 'ab' }).success).toBe(false)
    })

    it('enforces number bounds and boolean types', () => {
        const schema = buildDataSchema([
            field('guests', InboundFormFieldType.NUMBER, { required: true, min: 1, max: 10 }),
            field('newsletter', InboundFormFieldType.BOOLEAN, { required: true }),
        ])

        expect(schema.safeParse({ guests: 5, newsletter: true }).success).toBe(true)
        expect(schema.safeParse({ guests: 0, newsletter: true }).success).toBe(false)
        expect(schema.safeParse({ guests: 5, newsletter: 'yes' }).success).toBe(false)
    })

    it('applies typed default values for omitted fields', () => {
        const schema = buildDataSchema([
            field('source', InboundFormFieldType.TEXT, null, 'website'),
            field('guests', InboundFormFieldType.NUMBER, null, '2'),
            field('newsletter', InboundFormFieldType.BOOLEAN, null, 'true'),
        ])

        const result = schema.parse({})

        expect(result).toEqual({ source: 'website', guests: 2, newsletter: true })
    })

    it('bounds text fields without a configured maxLength at 5000 characters', () => {
        const schema = buildDataSchema([field('message', InboundFormFieldType.TEXT, { required: true })])

        expect(schema.safeParse({ message: 'a'.repeat(4999) }).success).toBe(true)
        expect(schema.safeParse({ message: 'a'.repeat(5001) }).success).toBe(false)
    })

    it('rejects an email longer than 254 characters', () => {
        const schema = buildDataSchema([field('email', InboundFormFieldType.EMAIL, { required: true })])

        expect(schema.safeParse({ email: `${'a'.repeat(250)}@example.com` }).success).toBe(false)
    })

    it('skips an invalid pattern while keeping the other constraints', () => {
        const schema = buildDataSchema([
            field('code', InboundFormFieldType.TEXT, { required: true, minLength: 2, pattern: '[' }),
        ])

        expect(schema.safeParse({ code: 'AB' }).success).toBe(true)
        expect(schema.safeParse({ code: 'A' }).success).toBe(false)
    })
})
