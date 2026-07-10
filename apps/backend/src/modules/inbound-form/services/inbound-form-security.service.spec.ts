import { ForbiddenException, Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
    InboundFormSecurityService,
    SecurityCheckResult,
    SecurityRequestContext,
} from './inbound-form-security.service'
import {
    InboundFormRecaptchaConfig,
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface'

function scheme(
    type: InboundFormSecurityType,
    location: InboundFormSecurityLocation,
    key: string,
    config: InboundFormRecaptchaConfig | null = null,
): InboundFormSecurity {
    return {
        inboundFormSecurityId: 1,
        inboundFormId: 1,
        type,
        location,
        key,
        config,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}

function context(partial: Partial<SecurityRequestContext> = {}): SecurityRequestContext {
    return { security: {}, headers: {}, query: {}, ...partial }
}

function expectUrlSearchParamsBody(body: BodyInit | null | undefined): URLSearchParams {
    if (!(body instanceof URLSearchParams)) {
        throw new Error('expected a URLSearchParams body')
    }
    return body
}

describe('InboundFormSecurityService', () => {
    let service: InboundFormSecurityService
    let fetchSpy: MockInstance<typeof fetch>

    beforeEach(() => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        service = new InboundFormSecurityService()
        fetchSpy = vi.spyOn(globalThis, 'fetch')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('honeypot', () => {
        const honeypot = scheme(InboundFormSecurityType.HONEYPOT, InboundFormSecurityLocation.BODY, 'website')

        it('passes when the honeypot value is empty', async () => {
            await expect(service.checkSubmission([honeypot], context({ security: { website: null } }))).resolves.toBe(
                SecurityCheckResult.PASSED,
            )
        })

        it('flags spam when the honeypot is filled', async () => {
            await expect(
                service.checkSubmission([honeypot], context({ security: { website: 'http://spam.example' } })),
            ).resolves.toBe(SecurityCheckResult.SPAM)
        })

        it('reads the honeypot from a header when configured', async () => {
            const headerHoneypot = { ...honeypot, location: InboundFormSecurityLocation.HEADER, key: 'X-Website' }

            await expect(
                service.checkSubmission([headerHoneypot], context({ headers: { 'x-website': 'spam' } })),
            ).resolves.toBe(SecurityCheckResult.SPAM)
        })

        it('reads the honeypot from the query when configured', async () => {
            const queryHoneypot = { ...honeypot, location: InboundFormSecurityLocation.QUERY, key: 'website' }

            await expect(
                service.checkSubmission([queryHoneypot], context({ query: { website: 'spam' } })),
            ).resolves.toBe(SecurityCheckResult.SPAM)
        })

        it('flags spam without verifying other schemes when the honeypot is filled', async () => {
            const recaptcha = scheme(
                InboundFormSecurityType.RECAPTCHA,
                InboundFormSecurityLocation.BODY,
                'recaptcha-token',
                { secret: 'secret-key' },
            )

            await expect(
                service.checkSubmission(
                    [recaptcha, honeypot],
                    context({ security: { website: 'spam', 'recaptcha-token': 'token-123' } }),
                ),
            ).resolves.toBe(SecurityCheckResult.SPAM)
            expect(fetchSpy).not.toHaveBeenCalled()
        })
    })

    describe('recaptcha', () => {
        const recaptcha = scheme(
            InboundFormSecurityType.RECAPTCHA,
            InboundFormSecurityLocation.BODY,
            'recaptcha-token',
            { secret: 'secret-key', minScore: 0.5 },
        )

        function mockVerification(payload: { success: boolean; score?: number }) {
            fetchSpy.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
        }

        it('passes a successful verification with a sufficient score', async () => {
            mockVerification({ success: true, score: 0.9 })

            const result = await service.checkSubmission(
                [recaptcha],
                context({ security: { 'recaptcha-token': 'token-123' } }),
            )

            expect(result).toBe(SecurityCheckResult.PASSED)
            const [url, init] = fetchSpy.mock.calls[0]!
            expect(url).toBe('https://www.google.com/recaptcha/api/siteverify')
            const body = expectUrlSearchParamsBody(init?.body)
            expect(body.toString()).toContain('secret=secret-key')
            expect(body.toString()).toContain('response=token-123')
        })

        it('rejects when the token is missing', async () => {
            await expect(service.checkSubmission([recaptcha], context())).rejects.toThrow(ForbiddenException)
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('rejects a failed verification', async () => {
            mockVerification({ success: false })

            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'bad' } })),
            ).rejects.toThrow(ForbiddenException)
        })

        it('rejects when the verification request fails', async () => {
            fetchSpy.mockRejectedValue(new Error('network down'))

            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'token-123' } })),
            ).rejects.toThrow(ForbiddenException)
        })

        it('rejects a score below minScore', async () => {
            mockVerification({ success: true, score: 0.2 })

            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'low' } })),
            ).rejects.toThrow(ForbiddenException)
        })

        it('reads the token from a header when configured', async () => {
            mockVerification({ success: true, score: 0.9 })
            const headerScheme = { ...recaptcha, location: InboundFormSecurityLocation.HEADER, key: 'X-Captcha' }

            const result = await service.checkSubmission(
                [headerScheme],
                context({ headers: { 'x-captcha': 'header-token' } }),
            )

            expect(result).toBe(SecurityCheckResult.PASSED)
        })

        it('reads the token from the query when configured', async () => {
            mockVerification({ success: true, score: 0.9 })
            const queryScheme = { ...recaptcha, location: InboundFormSecurityLocation.QUERY, key: 'captcha' }

            const result = await service.checkSubmission([queryScheme], context({ query: { captcha: 'query-token' } }))

            expect(result).toBe(SecurityCheckResult.PASSED)
        })
    })

    it('rejects unsupported scheme types', async () => {
        const csrf = scheme(InboundFormSecurityType.CSRF, InboundFormSecurityLocation.HEADER, 'x-csrf')

        await expect(service.checkSubmission([csrf], context())).rejects.toThrow(ForbiddenException)
    })
})
