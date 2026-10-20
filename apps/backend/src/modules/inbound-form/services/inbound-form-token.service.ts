import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Redis } from 'ioredis'
import type { Env } from '../../../config/env.schema.js'
import { THROTTLER_REDIS_CLIENT } from '../../throttler-storage/throttler-storage.constants.js'
import type { InboundFormTimedTokenConfig } from '../interfaces/inbound-form-security.interface.js'
import type { FormTokenClock, IssuedFormToken, VerifiedFormToken } from '../interfaces/inbound-form-token.interface.js'

export const FORM_TOKEN_CLOCK = Symbol('FORM_TOKEN_CLOCK')

export const systemFormTokenClock: FormTokenClock = { now: () => Date.now() }

interface FormTokenPayload {
    f: number
    n: string
    iat: number
    ip: string
}

const NONCE_BYTES = 16
const NONCE_KEY_PREFIX = 'inbound-form-token:'

@Injectable()
export class InboundFormTokenService {
    private readonly key: Buffer
    private readonly ipKey: Buffer

    constructor(
        configService: ConfigService<Env, true>,
        @Inject(THROTTLER_REDIS_CLIENT) private readonly redis: Pick<Redis, 'set'>,
        @Inject(FORM_TOKEN_CLOCK) private readonly clock: FormTokenClock,
    ) {
        const secret = configService.get('BACKEND_ENCRYPTION_SECRET', { infer: true })
        this.key = Buffer.from(hkdfSync('sha256', secret, '', 'inbound-form-token', 32))
        this.ipKey = Buffer.from(hkdfSync('sha256', secret, '', 'inbound-form-token-ip', 32))
    }

    issue(inboundFormId: number, ip: string, config: InboundFormTimedTokenConfig): IssuedFormToken {
        const now = this.clock.now()
        const payload: FormTokenPayload = {
            f: inboundFormId,
            n: randomBytes(NONCE_BYTES).toString('base64url'),
            iat: Math.ceil(now / 1000),
            ip: this.hashIp(ip),
        }
        const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url')
        const notBefore = new Date((payload.iat + config.minDelaySeconds) * 1000)

        return {
            token: `${payloadPart}.${this.sign(payloadPart)}`,
            notBefore,
            expiresAt: new Date((payload.iat + config.maxAgeSeconds) * 1000),
            waitMs: Math.max(0, notBefore.getTime() - now),
        }
    }

    verify(token: unknown, inboundFormId: number, ip: string, config: InboundFormTimedTokenConfig): VerifiedFormToken {
        if (typeof token !== 'string' || token === '') {
            throw new ForbiddenException('Missing form token')
        }

        const payload = this.decode(token)
        if (!payload || payload.f !== inboundFormId || !this.matches(payload.ip, this.hashIp(ip))) {
            throw new ForbiddenException('Invalid form token')
        }

        const now = this.clock.now()
        if (now < (payload.iat + config.minDelaySeconds) * 1000) {
            throw new ForbiddenException('Form token not yet valid')
        }
        if (now > (payload.iat + config.maxAgeSeconds) * 1000) {
            throw new ForbiddenException('Form token expired')
        }

        return { nonce: payload.n, maxAgeSeconds: config.maxAgeSeconds }
    }

    async consume(verified: VerifiedFormToken): Promise<void> {
        let reply: 'OK' | null
        try {
            reply = await this.redis.set(
                `${NONCE_KEY_PREFIX}${verified.nonce}`,
                '1',
                'EX',
                verified.maxAgeSeconds,
                'NX',
            )
        } catch {
            throw new ForbiddenException('Form token could not be verified')
        }
        if (reply === null) {
            throw new ForbiddenException('Form token already used')
        }
    }

    private decode(token: string): FormTokenPayload | null {
        const parts = token.split('.')
        if (parts.length !== 2) {
            return null
        }
        const [payloadPart = '', signaturePart = ''] = parts
        if (!this.matches(signaturePart, this.sign(payloadPart))) {
            return null
        }

        let decoded: unknown
        try {
            decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'))
        } catch {
            return null
        }
        return isFormTokenPayload(decoded) ? decoded : null
    }

    private sign(payloadPart: string): string {
        return createHmac('sha256', this.key).update(payloadPart).digest('base64url')
    }

    private hashIp(ip: string): string {
        return createHmac('sha256', this.ipKey).update(ip).digest('base64url')
    }

    private matches(actual: string, expected: string): boolean {
        const actualBuffer = Buffer.from(actual)
        const expectedBuffer = Buffer.from(expected)
        return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    }
}

function isFormTokenPayload(value: unknown): value is FormTokenPayload {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }
    if (!('f' in value && 'n' in value && 'iat' in value && 'ip' in value)) {
        return false
    }
    return (
        Number.isSafeInteger(value.f) &&
        typeof value.n === 'string' &&
        value.n !== '' &&
        Number.isSafeInteger(value.iat) &&
        typeof value.ip === 'string' &&
        value.ip !== ''
    )
}
