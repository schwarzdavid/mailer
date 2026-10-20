import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { ForbiddenException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { Redis } from 'ioredis'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { FORM_TOKEN_CLOCK, InboundFormTokenService } from './inbound-form-token.service.js'
import { THROTTLER_REDIS_CLIENT } from '../../throttler-storage/throttler-storage.constants.js'
import type { InboundFormTimedTokenConfig } from '../interfaces/inbound-form-security.interface.js'
import type { FormTokenClock, VerifiedFormToken } from '../interfaces/inbound-form-token.interface.js'

describe('InboundFormTokenService', () => {
    let service: InboundFormTokenService
    let set: Mock<Redis['set']>
    let now: number

    const t0 = Date.UTC(2026, 9, 20, 12, 0, 0)
    const formId = 7
    const ip = '203.0.113.10'
    const config: InboundFormTimedTokenConfig = { minDelaySeconds: 3, maxAgeSeconds: 3600 }

    const createService = async (secret: string): Promise<InboundFormTokenService> => {
        const get = vi.fn<(key: string) => string>().mockReturnValue(secret)
        const clock: FormTokenClock = { now: () => now }
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InboundFormTokenService,
                { provide: ConfigService, useValue: { get } },
                { provide: THROTTLER_REDIS_CLIENT, useValue: { set } },
                { provide: FORM_TOKEN_CLOCK, useValue: clock },
            ],
        }).compile()
        return module.get(InboundFormTokenService)
    }

    const thrownBy = (fn: () => unknown): unknown => {
        try {
            fn()
        } catch (error) {
            return error
        }
        return undefined
    }

    const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')

    beforeEach(async () => {
        now = t0
        set = vi.fn<Redis['set']>()
        service = await createService('test-encryption-secret')
    })

    it('round-trips a token after the minimum delay', () => {
        const issued = service.issue(formId, ip, config)

        expect(issued.waitMs).toBe(3000)
        expect(issued.notBefore).toEqual(new Date(t0 + 3000))
        expect(issued.expiresAt).toEqual(new Date(t0 + 3600 * 1000))

        now = t0 + 3000
        const verified = service.verify(issued.token, formId, ip, config)

        expect(verified.maxAgeSeconds).toBe(3600)
        expect(verified.nonce).toMatch(/^[A-Za-z0-9_-]{22}$/)
    })

    it('never accepts a token before the minimum delay has elapsed in real milliseconds', () => {
        now = t0 + 400
        const issued = service.issue(formId, ip, config)

        expect(issued.notBefore.getTime()).toBeGreaterThanOrEqual(now + 3000)
        expect(issued.waitMs).toBeGreaterThanOrEqual(3000)

        now = t0 + 400 + 2999
        expect(thrownBy(() => service.verify(issued.token, formId, ip, config))).toEqual(
            new ForbiddenException('Form token not yet valid'),
        )

        now = issued.notBefore.getTime()
        expect(service.verify(issued.token, formId, ip, config).maxAgeSeconds).toBe(3600)
    })

    it('does not expose a plain hash of the ip in the payload', () => {
        const { token } = service.issue(formId, ip, config)
        const payload = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')) as {
            ip: string
        }

        expect(payload.ip).not.toBe(createHash('sha256').update(ip).digest('base64url'))
    })

    it('issues a fresh nonce per token', () => {
        now = t0
        const first = service.issue(formId, ip, config)
        const second = service.issue(formId, ip, config)
        now = t0 + 3000

        expect(service.verify(first.token, formId, ip, config).nonce).not.toBe(
            service.verify(second.token, formId, ip, config).nonce,
        )
    })

    it('rejects before the delay', () => {
        const { token } = service.issue(formId, ip, config)
        now = t0 + 2900

        expect(thrownBy(() => service.verify(token, formId, ip, config))).toEqual(
            new ForbiddenException('Form token not yet valid'),
        )
    })

    it('accepts at max age', () => {
        const { token } = service.issue(formId, ip, config)
        now = t0 + 3600 * 1000

        expect(service.verify(token, formId, ip, config).maxAgeSeconds).toBe(3600)
    })

    it('rejects after max age', () => {
        const { token } = service.issue(formId, ip, config)
        now = t0 + 3601 * 1000

        expect(thrownBy(() => service.verify(token, formId, ip, config))).toEqual(
            new ForbiddenException('Form token expired'),
        )
    })

    it('rejects another form', () => {
        const { token } = service.issue(formId, ip, config)
        now = t0 + 3000

        expect(thrownBy(() => service.verify(token, formId + 1, ip, config))).toEqual(
            new ForbiddenException('Invalid form token'),
        )
    })

    it('rejects another ip', () => {
        const { token } = service.issue(formId, ip, config)
        now = t0 + 3000

        expect(thrownBy(() => service.verify(token, formId, '203.0.113.11', config))).toEqual(
            new ForbiddenException('Invalid form token'),
        )
    })

    it('rejects a tampered payload', () => {
        const { token } = service.issue(formId, ip, config)
        const [payload, signature] = token.split('.')
        const tamperedPayload = Buffer.from(payload ?? '', 'base64url')
            .toString('utf8')
            .replace(`"f":${formId}`, `"f":${formId + 1}`)
        const tampered = `${Buffer.from(tamperedPayload).toString('base64url')}.${signature}`
        now = t0 + 3000

        expect(tamperedPayload).toContain(`"f":${formId + 1}`)
        expect(thrownBy(() => service.verify(tampered, formId + 1, ip, config))).toEqual(
            new ForbiddenException('Invalid form token'),
        )
    })

    it('rejects a tampered issue time', () => {
        const { token } = service.issue(formId, ip, config)
        const [payload, signature] = token.split('.')
        const iat = Math.ceil(t0 / 1000)
        const tamperedPayload = Buffer.from(payload ?? '', 'base64url')
            .toString('utf8')
            .replace(`"iat":${iat}`, `"iat":${iat - 10}`)
        const tampered = `${Buffer.from(tamperedPayload).toString('base64url')}.${signature}`
        now = t0 + 1000

        expect(tamperedPayload).toContain(`"iat":${iat - 10}`)

        expect(thrownBy(() => service.verify(tampered, formId, ip, config))).toEqual(
            new ForbiddenException('Invalid form token'),
        )
    })

    it('rejects a token signed with another secret', async () => {
        const other = await createService('another-secret')
        const { token } = other.issue(formId, ip, config)
        now = t0 + 3000

        expect(thrownBy(() => service.verify(token, formId, ip, config))).toEqual(
            new ForbiddenException('Invalid form token'),
        )
    })

    it.each([undefined, '', 42, null, {}])('rejects a missing token (%s)', (token) => {
        expect(thrownBy(() => service.verify(token, formId, ip, config))).toEqual(
            new ForbiddenException('Missing form token'),
        )
    })

    it.each(['no-dot', 'a.b.c', '.', 'payload.', '!!!.???', `${Buffer.from('not json').toString('base64url')}.AAAA`])(
        'rejects a malformed token (%s)',
        (token) => {
            now = t0 + 3000

            expect(thrownBy(() => service.verify(token, formId, ip, config))).toEqual(
                new ForbiddenException('Invalid form token'),
            )
        },
    )

    it('rejects a signature of the wrong length', () => {
        const { token } = service.issue(formId, ip, config)
        const [payload, signature] = token.split('.')
        now = t0 + 3000

        expect(
            thrownBy(() => service.verify(`${payload}.${(signature ?? '').slice(0, -2)}`, formId, ip, config)),
        ).toEqual(new ForbiddenException('Invalid form token'))
    })

    it.each([
        { f: '7', n: 'nonce', iat: 1, ip: 'x' },
        { f: 7, n: 1, iat: 1, ip: 'x' },
        { f: 7, n: 'nonce', iat: '1', ip: 'x' },
        { f: 7, n: 'nonce', iat: 1, ip: 1 },
        { f: 7, n: '', iat: 1, ip: 'x' },
        [7, 'nonce', 1, 'x'],
        'string',
        null,
    ])('rejects a correctly signed payload of the wrong shape (%j)', async (payload) => {
        const { createHmac, hkdfSync } = await import('node:crypto')
        const key = Buffer.from(hkdfSync('sha256', 'test-encryption-secret', '', 'inbound-form-token', 32))
        const payloadPart = encode(payload)
        const signature = createHmac('sha256', key).update(payloadPart).digest('base64url')
        now = t0 + 3000

        expect(thrownBy(() => service.verify(`${payloadPart}.${signature}`, formId, ip, config))).toEqual(
            new ForbiddenException('Invalid form token'),
        )
    })

    it('consumes a nonce once', async () => {
        set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null)
        const verified: VerifiedFormToken = { nonce: 'abc', maxAgeSeconds: 3600 }

        await expect(service.consume(verified)).resolves.toBeUndefined()
        await expect(service.consume(verified)).rejects.toThrow(new ForbiddenException('Form token already used'))
        expect(set).toHaveBeenCalledWith('inbound-form-token:abc', '1', 'EX', 3600, 'NX')
    })

    it('fails closed when redis errors', async () => {
        set.mockRejectedValue(new Error('Connection is closed.'))

        await expect(service.consume({ nonce: 'abc', maxAgeSeconds: 3600 })).rejects.toThrow(
            new ForbiddenException('Form token could not be verified'),
        )
    })
})
