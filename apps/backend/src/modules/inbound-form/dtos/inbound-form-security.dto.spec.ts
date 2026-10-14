import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate, type ValidationError } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { InboundFormSecurityPutDto } from './inbound-form-security.dto.js'
import { InboundFormSecurityLocation, InboundFormSecurityType } from '../interfaces/inbound-form-security.interface.js'

function flatten(errors: ValidationError[], prefix = ''): string[] {
    return errors.flatMap((error) => {
        const path = prefix + error.property
        return error.children?.length ? flatten(error.children, `${path}.`) : [path]
    })
}

async function violations(plain: object): Promise<string[]> {
    return flatten(await validate(plainToInstance(InboundFormSecurityPutDto, plain, { exposeDefaultValues: true })))
}

const recaptcha = {
    type: InboundFormSecurityType.RECAPTCHA,
    location: InboundFormSecurityLocation.BODY,
    key: 'g-recaptcha-response',
    config: { secret: 'server-secret', minScore: 0.5 },
}

const honeypot = {
    type: InboundFormSecurityType.HONEYPOT,
    location: InboundFormSecurityLocation.BODY,
    key: 'website',
}

describe('InboundFormSecurityPutDto', () => {
    it('accepts valid schemes', async () => {
        await expect(violations({ security: [recaptcha, honeypot] })).resolves.toEqual([])
    })

    it('accepts an empty list to remove every scheme', async () => {
        await expect(violations({ security: [] })).resolves.toEqual([])
    })

    it('defaults a missing config to null', () => {
        const dto = plainToInstance(InboundFormSecurityPutDto, { security: [honeypot] }, { exposeDefaultValues: true })

        expect(dto.security[0]!.config).toBeNull()
    })

    it('rejects unknown scheme types and locations', async () => {
        await expect(
            violations({ security: [{ ...honeypot, type: 'basic-auth', location: 'cookie' }] }),
        ).resolves.toEqual(['security.0.type', 'security.0.location'])
    })

    it('rejects an empty key', async () => {
        await expect(violations({ security: [{ ...honeypot, key: '' }] })).resolves.toEqual(['security.0.key'])
    })

    it('requires a non-empty recaptcha secret inside a config', async () => {
        await expect(
            violations({ security: [{ ...recaptcha, config: { secret: '', minScore: 0.5 } }] }),
        ).resolves.toEqual(['security.0.config.secret'])
    })

    it.each([-0.1, 1.1, '0.5'])('rejects a minimum score of %s', async (minScore) => {
        await expect(
            violations({ security: [{ ...recaptcha, config: { secret: 'server-secret', minScore } }] }),
        ).resolves.toEqual(['security.0.config.minScore'])
    })

    it.each([0, 1])('accepts the boundary minimum score %s', async (minScore) => {
        await expect(
            violations({ security: [{ ...recaptcha, config: { secret: 'server-secret', minScore } }] }),
        ).resolves.toEqual([])
    })

    it('requires the security array', async () => {
        await expect(violations({})).resolves.toEqual(['security'])
    })
})
