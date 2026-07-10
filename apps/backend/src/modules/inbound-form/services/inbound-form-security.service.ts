import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import {
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface'

export interface SecurityRequestContext {
    security: Record<string, unknown>
    headers: Record<string, unknown>
    query: Record<string, unknown>
}

export enum SecurityCheckResult {
    PASSED = 'passed',
    SPAM = 'spam',
}

interface RecaptchaVerification {
    success: boolean
    score?: number
}

@Injectable()
export class InboundFormSecurityService {
    private static readonly RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
    private static readonly RECAPTCHA_TIMEOUT_MS = 5000

    private readonly logger = new Logger(InboundFormSecurityService.name)

    async checkSubmission(
        schemes: InboundFormSecurity[],
        context: SecurityRequestContext,
    ): Promise<SecurityCheckResult> {
        for (const scheme of schemes) {
            if (scheme.type !== InboundFormSecurityType.HONEYPOT) {
                continue
            }
            const value = this.extractValue(scheme, context)
            if (value !== undefined && value !== null && value !== '') {
                this.logger.warn(`Honeypot "${scheme.key}" triggered for form ${scheme.inboundFormId}`)
                return SecurityCheckResult.SPAM
            }
        }

        for (const scheme of schemes) {
            if (scheme.type === InboundFormSecurityType.HONEYPOT) {
                continue
            }
            if (scheme.type !== InboundFormSecurityType.RECAPTCHA) {
                throw new ForbiddenException(`Unsupported security scheme: ${scheme.type}`)
            }
            await this.verifyRecaptcha(scheme, this.extractValue(scheme, context))
        }

        return SecurityCheckResult.PASSED
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

    private async verifyRecaptcha(scheme: InboundFormSecurity, value: unknown): Promise<void> {
        if (typeof value !== 'string' || value === '') {
            throw new ForbiddenException('Missing captcha token')
        }
        if (!scheme.config?.secret) {
            throw new ForbiddenException('Captcha is not configured')
        }

        let response: Response
        try {
            response = await fetch(InboundFormSecurityService.RECAPTCHA_VERIFY_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ secret: scheme.config.secret, response: value }),
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

        const minScore = scheme.config.minScore
        if (minScore !== undefined && (verification.score ?? 0) < minScore) {
            throw new ForbiddenException('Captcha score too low')
        }
    }
}
