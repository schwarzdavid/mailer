import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { InboundFormSubmitDto } from './inbound-form-submit.dto.js'

async function violations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(InboundFormSubmitDto, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe('InboundFormSubmitDto', () => {
    it('accepts data with optional security values', async () => {
        await expect(violations({ data: { email: 'max@example.com' } })).resolves.toEqual([])
        await expect(violations({ data: {}, security: { 'g-recaptcha-response': 'token' } })).resolves.toEqual([])
    })

    it('requires a data object', async () => {
        await expect(violations({})).resolves.toEqual(['data'])
    })

    it.each([
        ['a string', 'email=max@example.com'],
        ['an array', [{ email: 'max@example.com' }]],
        ['null', null],
    ])('rejects data sent as %s', async (_, data) => {
        await expect(violations({ data })).resolves.toEqual(['data'])
    })

    it('rejects security values that are not an object', async () => {
        await expect(violations({ data: {}, security: 'token' })).resolves.toEqual(['security'])
    })
})
