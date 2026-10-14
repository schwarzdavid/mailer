import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { DomainCreateDto } from './domain-create.dto.js'

async function violations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(DomainCreateDto, plain, { exposeDefaultValues: true }))
    return [...new Set(errors.map((error) => error.property))]
}

describe('DomainCreateDto', () => {
    it.each(['example.com', 'mail.example.co.uk', 'sub.domain.example.org'])('accepts %s', async (fqdn) => {
        await expect(violations({ fqdn })).resolves.toEqual([])
    })

    it.each([
        ['a missing domain', undefined],
        ['an empty domain', ''],
        ['a bare label', 'localhost'],
        ['an IP address', '203.0.113.10'],
        ['a domain with a path', 'example.com/admin'],
        ['a domain with whitespace', 'exa mple.com'],
        ['a non-ICANN suffix', 'example.internal'],
    ])('rejects %s', async (_, fqdn) => {
        await expect(violations({ fqdn })).resolves.toEqual(['fqdn'])
    })
})
