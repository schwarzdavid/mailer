import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import {
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface.js'
import { isRecaptchaConfig, isTimedTokenConfig } from '../helpers/security-config.js'
import { isOriginAllowed } from '../helpers/origin.js'
import { normalizeHostname } from '../helpers/hostname.js'
import { SecretEncryptionService } from '../../encryption/services/secret-encryption.service.js'
import { InboundFormTokenService } from './inbound-form-token.service.js'
import { VerifiedFormToken } from '../interfaces/inbound-form-token.interface.js'

export interface SecurityRequestContext {
    security: Record<string, unknown>
    headers: Record<string, unknown>
    query: Record<string, unknown>
    allowedHostnames: string[]
    ip: string
}

export enum SecurityCheckResult {
    PASSED = 'passed',
    SPAM = 'spam',
}

export type SecurityCheckOutcome =
    { result: SecurityCheckResult.SPAM } | { result: SecurityCheckResult.PASSED; token: VerifiedFormToken | null }

interface RecaptchaVerification {
    success: boolean
    score?: number
    hostname?: unknown
    action?: string
}

@Injectable()
export class InboundFormSecurityService {
    private static readonly RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
    private static readonly RECAPTCHA_TIMEOUT_MS = 5000

    private readonly logger = new Logger(InboundFormSecurityService.name)

    constructor(
        private readonly secretEncryptionService: SecretEncryptionService,
        private readonly tokenService: InboundFormTokenService,
    ) {}

    async checkSubmission(
        schemes: InboundFormSecurity[],
        context: SecurityRequestContext,
    ): Promise<SecurityCheckOutcome> {
        if (!isOriginAllowed(context.allowedHostnames, context.headers)) {
            throw new ForbiddenException('Origin not allowed')
        }

        for (const scheme of schemes) {
            if (scheme.type !== InboundFormSecurityType.HONEYPOT) {
                continue
            }
            const value = this.extractValue(scheme, context)
            if (value !== undefined && value !== null && value !== '') {
                this.logger.warn(`Honeypot "${scheme.key}" triggered for form ${scheme.inboundFormId}`)
                return { result: SecurityCheckResult.SPAM }
            }
        }

        let token: VerifiedFormToken | null = null
        for (const scheme of schemes) {
            if (scheme.type === InboundFormSecurityType.TIMED_TOKEN) {
                token = this.verifyTimedToken(scheme, this.extractValue(scheme, context), context.ip)
            }
        }

        for (const scheme of schemes) {
            if (scheme.type === InboundFormSecurityType.RECAPTCHA) {
                await this.verifyRecaptcha(scheme, this.extractValue(scheme, context), context.allowedHostnames)
            }
        }

        return { result: SecurityCheckResult.PASSED, token }
    }

    private verifyTimedToken(scheme: InboundFormSecurity, value: unknown, ip: string): VerifiedFormToken {
        if (!isTimedTokenConfig(scheme.config)) {
            throw new ForbiddenException('Form token is not configured')
        }
        return this.tokenService.verify(value, scheme.inboundFormId, ip, scheme.config)
    }

    private extractValue(scheme: InboundFormSecurity, context: SecurityRequestContext): unknown {
        switch (scheme.location) {
            case InboundFormSecurityLocation.BODY:
                return context.security[scheme.key]
            case InboundFormSecurityLocation.HEADER:
                return context.headers[scheme.key.toLowerCase()]
            case InboundFormSecurityLocation.QUERY:
                return context.query[scheme.key]
        }
    }

    private async verifyRecaptcha(
        scheme: InboundFormSecurity,
        value: unknown,
        allowedHostnames: string[],
    ): Promise<void> {
        if (typeof value !== 'string' || value === '') {
            throw new ForbiddenException('Missing captcha token')
        }
        if (!isRecaptchaConfig(scheme.config) || !scheme.config.encryptedSecret) {
            throw new ForbiddenException('Captcha is not configured')
        }

        const secret = await this.decryptRecaptchaSecret(scheme, scheme.config.encryptedSecret)

        let response: Response
        try {
            response = await fetch(InboundFormSecurityService.RECAPTCHA_VERIFY_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ secret, response: value }),
                signal: AbortSignal.timeout(InboundFormSecurityService.RECAPTCHA_TIMEOUT_MS),
            })
        } catch {
            throw new ForbiddenException('Captcha verification unavailable')
        }

        if (!response.ok) {
            throw new ForbiddenException('Captcha verification unavailable')
        }

        const verification = (await response.json()) as RecaptchaVerification

        if (!verification.success) {
            throw new ForbiddenException('Captcha verification failed')
        }

        if (allowedHostnames.length > 0) {
            const hostname = typeof verification.hostname === 'string' ? normalizeHostname(verification.hostname) : null
            if (hostname === null || !allowedHostnames.includes(hostname)) {
                throw new ForbiddenException('Captcha hostname mismatch')
            }
        }

        const expectedAction = scheme.config.expectedAction
        if (expectedAction !== undefined && verification.action !== expectedAction) {
            throw new ForbiddenException('Captcha action mismatch')
        }

        const minScore = scheme.config.minScore
        if (minScore !== undefined && (verification.score ?? 0) < minScore) {
            throw new ForbiddenException('Captcha score too low')
        }
    }

    private async decryptRecaptchaSecret(scheme: InboundFormSecurity, encryptedSecret: string): Promise<string> {
        try {
            return await this.secretEncryptionService.decrypt(encryptedSecret)
        } catch {
            this.logger.error(
                `Stored reCAPTCHA secret of form ${scheme.inboundFormId} could not be decrypted; check BACKEND_ENCRYPTION_SECRET`,
            )
            throw new ForbiddenException('Captcha is not configured')
        }
    }
}
