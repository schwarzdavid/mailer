import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { SendingDomainConfigureDto } from './sending-domain-configure.dto.js'

async function violations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(SendingDomainConfigureDto, plain, { exposeDefaultValues: true }))
    return [...new Set(errors.map((error) => error.property))]
}

describe('SendingDomainConfigureDto', () => {
    const valid = { fqdn: 'mail.sending-domain.org', serverIpv4: '203.0.113.10' }

    it('accepts a domain with an IPv4 address', async () => {
        await expect(violations(valid)).resolves.toEqual([])
    })

    it('accepts an optional IPv6 address', async () => {
        await expect(violations({ ...valid, serverIpv6: '2001:db8::10' })).resolves.toEqual([])
    })

    it.each([
        ['an empty domain', ''],
        ['a bare label', 'localhost'],
        ['a URL', 'https://mail.example.com'],
        ['a non-ICANN suffix', 'mail.example.invalidtld'],
    ])('rejects %s', async (_, fqdn) => {
        await expect(violations({ ...valid, fqdn })).resolves.toEqual(['fqdn'])
    })

    it.each(['2001:db8::10', '203.0.113', '999.0.113.10', ''])(
        'rejects "%s" as the IPv4 address',
        async (serverIpv4) => {
            await expect(violations({ ...valid, serverIpv4 })).resolves.toEqual(['serverIpv4'])
        },
    )

    it('rejects an IPv4 address in the IPv6 slot', async () => {
        await expect(violations({ ...valid, serverIpv6: '203.0.113.10' })).resolves.toEqual(['serverIpv6'])
    })

    it('requires the IPv4 address', async () => {
        await expect(violations({ fqdn: valid.fqdn })).resolves.toEqual(['serverIpv4'])
    })
})
