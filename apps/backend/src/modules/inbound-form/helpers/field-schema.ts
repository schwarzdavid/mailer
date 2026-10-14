import { z } from 'zod'
import { InboundFormField, InboundFormFieldType } from '../interfaces/inbound-form-field.interface.js'
import { findPatternProblem } from './pattern-safety.js'

export const MAX_TEXT_LENGTH = 5000
export const MAX_PATTERN_INPUT_LENGTH = 1000
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
            const pattern = validation.pattern === undefined ? null : compilePattern(validation.pattern)
            const lengthCap = pattern ? MAX_PATTERN_INPUT_LENGTH : MAX_TEXT_LENGTH
            stringSchema = stringSchema.max(Math.min(validation.maxLength ?? lengthCap, lengthCap), { abort: true })
            if (pattern) {
                stringSchema = stringSchema.regex(pattern)
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
    return findPatternProblem(pattern) === null ? new RegExp(pattern) : null
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
