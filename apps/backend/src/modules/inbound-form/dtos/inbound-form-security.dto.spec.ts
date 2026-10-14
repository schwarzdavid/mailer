import 'reflect-metadata'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { validate, type ValidationError } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { InboundFormSecurityDto, InboundFormSecurityPutDto } from './inbound-form-security.dto.js'
import {
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface.js'

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

    it.each([
        ['without a config', { ...recaptcha, config: undefined }],
        ['with only a minimum score', { ...recaptcha, config: { minScore: 0.5 } }],
    ])('accepts a recaptcha scheme %s so the stored secret can be kept', async (_case, scheme) => {
        await expect(violations({ security: [scheme] })).resolves.toEqual([])
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

describe('InboundFormSecurityDto', () => {
    const stored: InboundFormSecurity = {
        inboundFormSecurityId: 7,
        inboundFormId: 1,
        type: InboundFormSecurityType.RECAPTCHA,
        location: InboundFormSecurityLocation.BODY,
        key: 'g-recaptcha-response',
        config: { encryptedSecret: 'v1.salt.iv.tag.ciphertext', minScore: 0.5 },
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    function serialize(security: InboundFormSecurity): Record<string, unknown> {
        return instanceToPlain(
            plainToInstance(InboundFormSecurityDto, InboundFormSecurityDto.fromSecurity(security), {
                excludeExtraneousValues: true,
            }),
            { excludeExtraneousValues: true },
        )
    }

    it('reports that a secret is configured without exposing it or its ciphertext', () => {
        const serialized = serialize(stored)

        expect(serialized).toEqual({
            inboundFormSecurityId: 7,
            type: InboundFormSecurityType.RECAPTCHA,
            location: InboundFormSecurityLocation.BODY,
            key: 'g-recaptcha-response',
            config: { hasSecret: true, minScore: 0.5 },
        })
        expect(JSON.stringify(serialized)).not.toContain('ciphertext')
    })

    it('strips a stray secret even if one reaches the serializer', () => {
        const serialized = instanceToPlain(
            plainToInstance(
                InboundFormSecurityDto,
                { ...stored, config: { hasSecret: true, secret: 'plain', encryptedSecret: 'v1.x' } },
                { excludeExtraneousValues: true },
            ),
            { excludeExtraneousValues: true },
        )

        expect(serialized.config).toEqual({ hasSecret: true })
    })

    it('maps a scheme without config to null', () => {
        expect(serialize({ ...stored, type: InboundFormSecurityType.HONEYPOT, config: null }).config).toBeNull()
    })
})
