import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate, type ValidationError } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { InboundFormFieldsPutDto, InboundFormFieldUpsertDto } from './inbound-form-field.dto.js'
import { InboundFormFieldType } from '../interfaces/inbound-form-field.interface.js'

function flatten(errors: ValidationError[], prefix = ''): string[] {
    return errors.flatMap((error) => {
        const path = prefix + error.property
        return error.children?.length ? flatten(error.children, `${path}.`) : [path]
    })
}

async function violations(plain: object): Promise<string[]> {
    return flatten(await validate(plainToInstance(InboundFormFieldsPutDto, plain, { exposeDefaultValues: true })))
}

const emailField = {
    key: 'email',
    label: 'Email',
    type: InboundFormFieldType.EMAIL,
    validation: { required: true },
}

describe('InboundFormFieldsPutDto', () => {
    it('accepts a list of valid fields', async () => {
        await expect(
            violations({
                fields: [
                    emailField,
                    {
                        key: 'message_body-1',
                        label: 'Message',
                        type: InboundFormFieldType.TEXT,
                        defaultValue: 'Hi',
                        validation: { minLength: 0, maxLength: 500, pattern: '^[a-z]+$' },
                    },
                    { key: 'age', label: 'Age', type: InboundFormFieldType.NUMBER, validation: { min: -1, max: 1.5 } },
                ],
            }),
        ).resolves.toEqual([])
    })

    it('accepts an empty list to remove every field', async () => {
        await expect(violations({ fields: [] })).resolves.toEqual([])
    })

    it('requires the fields array', async () => {
        await expect(violations({})).resolves.toEqual(['fields'])
        await expect(violations({ fields: emailField })).resolves.toContain('fields')
    })

    it('defaults the default value and validation to null', () => {
        const dto = plainToInstance(
            InboundFormFieldUpsertDto,
            { key: 'name', label: 'Name', type: InboundFormFieldType.TEXT },
            { exposeDefaultValues: true },
        )

        expect(dto.defaultValue).toBeNull()
        expect(dto.validation).toBeNull()
    })

    it.each([
        ['spaces', 'first name'],
        ['dots', 'user.email'],
        ['template braces', '{{email}}'],
        ['an empty string', ''],
    ])('rejects keys with %s', async (_, key) => {
        await expect(violations({ fields: [{ ...emailField, key }] })).resolves.toEqual(['fields.0.key'])
    })

    it('rejects an unknown field type', async () => {
        await expect(violations({ fields: [{ ...emailField, type: 'file' }] })).resolves.toEqual(['fields.0.type'])
    })

    it('rejects an empty label', async () => {
        await expect(violations({ fields: [{ ...emailField, label: '' }] })).resolves.toEqual(['fields.0.label'])
    })

    it('validates each nested validation rule', async () => {
        await expect(
            violations({
                fields: [
                    {
                        ...emailField,
                        validation: { required: 'yes', minLength: -1, maxLength: 2.5, pattern: 5, min: '0', max: '9' },
                    },
                ],
            }),
        ).resolves.toEqual([
            'fields.0.validation.required',
            'fields.0.validation.minLength',
            'fields.0.validation.maxLength',
            'fields.0.validation.pattern',
            'fields.0.validation.min',
            'fields.0.validation.max',
        ])
    })

    it('reports the index of the invalid entry', async () => {
        await expect(violations({ fields: [emailField, { ...emailField, key: 'bad key' }] })).resolves.toEqual([
            'fields.1.key',
        ])
    })
})
