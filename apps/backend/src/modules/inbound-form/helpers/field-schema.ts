import { z } from 'zod'
import { InboundFormField, InboundFormFieldType } from '../interfaces/inbound-form-field.interface'

const DEFAULT_MAX_TEXT_LENGTH = 5000
const MAX_EMAIL_LENGTH = 254

export function buildDataSchema(fields: InboundFormField[]) {
    const shape: Record<string, z.ZodType> = {}
    for (const field of fields) {
        shape[field.key] = buildFieldSchema(field)
    }
    return z.object(shape)
}

function buildFieldSchema(field: InboundFormField): z.ZodType {
    const validation = field.validation ?? {}
    let schema: z.ZodType

    switch (field.type) {
        case InboundFormFieldType.EMAIL: {
            schema = z.email().max(MAX_EMAIL_LENGTH)
            break
        }
        case InboundFormFieldType.NUMBER: {
            let numberSchema = z.number()
            if (validation.min !== undefined) {
                numberSchema = numberSchema.min(validation.min)
            }
            if (validation.max !== undefined) {
                numberSchema = numberSchema.max(validation.max)
            }
            schema = numberSchema
            break
        }
        case InboundFormFieldType.BOOLEAN: {
            schema = z.boolean()
            break
        }
        default: {
            let stringSchema = z.string()
            if (validation.minLength !== undefined) {
                stringSchema = stringSchema.min(validation.minLength)
            }
            stringSchema = stringSchema.max(validation.maxLength ?? DEFAULT_MAX_TEXT_LENGTH)
            if (validation.pattern !== undefined) {
                const pattern = compilePattern(validation.pattern)
                if (pattern) {
                    stringSchema = stringSchema.regex(pattern)
                }
            }
            schema = stringSchema
        }
    }

    if (field.defaultValue !== null) {
        return schema.default(castDefaultValue(field))
    }
    if (!validation.required) {
        return schema.optional()
    }
    return schema
}

function compilePattern(pattern: string): RegExp | null {
    try {
        return new RegExp(pattern)
    } catch {
        return null
    }
}

function castDefaultValue(field: InboundFormField): unknown {
    if (field.type === InboundFormFieldType.NUMBER) {
        return Number(field.defaultValue)
    }
    if (field.type === InboundFormFieldType.BOOLEAN) {
        return field.defaultValue === 'true'
    }
    return field.defaultValue
}
