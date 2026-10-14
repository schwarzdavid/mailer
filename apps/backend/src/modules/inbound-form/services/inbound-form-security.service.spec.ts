import { ForbiddenException, Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from 'vitest'
import {
    InboundFormSecurityService,
    SecurityCheckResult,
    SecurityRequestContext,
} from './inbound-form-security.service.js'
import {
    InboundFormRecaptchaStoredConfig,
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface.js'
import { SecretEncryptionService } from '../../encryption/services/secret-encryption.service.js'

function scheme(
    type: InboundFormSecurityType,
    location: InboundFormSecurityLocation,
    key: string,
    config: InboundFormRecaptchaStoredConfig | null = null,
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

const encryptedSecret = 'v1.salt.iv.tag.ciphertext'

describe('InboundFormSecurityService', () => {
    let service: InboundFormSecurityService
    let fetchSpy: MockInstance<typeof fetch>
    let decrypt: Mock<SecretEncryptionService['decrypt']>
    let errorSpy: MockInstance<Logger['error']>

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        decrypt = vi.fn<SecretEncryptionService['decrypt']>().mockResolvedValue('secret-key')

        const module = await Test.createTestingModule({
            providers: [InboundFormSecurityService, { provide: SecretEncryptionService, useValue: { decrypt } }],
        }).compile()

        service = module.get(InboundFormSecurityService)
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

        it('passes when the honeypot is an empty string', async () => {
            await expect(service.checkSubmission([honeypot], context({ security: { website: '' } }))).resolves.toBe(
                SecurityCheckResult.PASSED,
            )
        })

        it('flags spam for any non-empty honeypot value, not only strings', async () => {
            await expect(service.checkSubmission([honeypot], context({ security: { website: 0 } }))).resolves.toBe(
                SecurityCheckResult.SPAM,
            )
            await expect(service.checkSubmission([honeypot], context({ security: { website: false } }))).resolves.toBe(
                SecurityCheckResult.SPAM,
            )
        })

        it('ignores honeypot values sent in a different location', async () => {
            await expect(
                service.checkSubmission(
                    [honeypot],
                    context({ headers: { website: 'spam' }, query: { website: 'spam' } }),
                ),
            ).resolves.toBe(SecurityCheckResult.PASSED)
        })

        it('flags spam without verifying other schemes when the honeypot is filled', async () => {
            const recaptcha = scheme(
                InboundFormSecurityType.RECAPTCHA,
                InboundFormSecurityLocation.BODY,
                'recaptcha-token',
                { encryptedSecret },
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
            { encryptedSecret, minScore: 0.5 },
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
            expect(body.get('secret')).toBe('secret-key')
            expect(body.toString()).toContain('response=token-123')
        })

        it('sends the decrypted secret, never the stored ciphertext, to the verifier', async () => {
            mockVerification({ success: true, score: 0.9 })

            await service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'token-123' } }))

            expect(decrypt).toHaveBeenCalledWith(encryptedSecret)
            const [, init] = fetchSpy.mock.calls[0]!
            expect(expectUrlSearchParamsBody(init?.body).toString()).not.toContain(encodeURIComponent(encryptedSecret))
        })

        it('rejects as unconfigured and logs when the stored secret cannot be decrypted', async () => {
            decrypt.mockRejectedValue(new Error('Unsupported state or unable to authenticate data'))

            const result = service.checkSubmission(
                [recaptcha],
                context({ security: { 'recaptcha-token': 'token-123' } }),
            )

            await expect(result).rejects.toThrow(new ForbiddenException('Captcha is not configured'))
            expect(fetchSpy).not.toHaveBeenCalled()
            expect(errorSpy).toHaveBeenCalledTimes(1)
            expect(String(errorSpy.mock.calls[0]![0])).not.toContain(encryptedSecret)
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

        it('rejects an empty token without calling the verifier', async () => {
            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': '' } })),
            ).rejects.toThrow(new ForbiddenException('Missing captcha token'))
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('rejects a non-string token without calling the verifier', async () => {
            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': ['a', 'b'] } })),
            ).rejects.toThrow(new ForbiddenException('Missing captcha token'))
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('rejects when the scheme has no secret configured', async () => {
            const unconfigured = { ...recaptcha, config: null }

            await expect(
                service.checkSubmission([unconfigured], context({ security: { 'recaptcha-token': 'token-123' } })),
            ).rejects.toThrow(new ForbiddenException('Captcha is not configured'))
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('rejects when the verifier answers with a non-2xx status', async () => {
            fetchSpy.mockResolvedValue(new Response('upstream error', { status: 503 }))

            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'token-123' } })),
            ).rejects.toThrow(new ForbiddenException('Captcha verification unavailable'))
        })

        it('treats a missing score as zero when a minimum score is configured', async () => {
            mockVerification({ success: true })

            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'token-123' } })),
            ).rejects.toThrow(new ForbiddenException('Captcha score too low'))
        })

        it('accepts a score exactly at the minimum', async () => {
            mockVerification({ success: true, score: 0.5 })

            await expect(
                service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'token-123' } })),
            ).resolves.toBe(SecurityCheckResult.PASSED)
        })

        it('ignores the score when no minimum is configured', async () => {
            mockVerification({ success: true, score: 0 })
            const lenient = { ...recaptcha, config: { encryptedSecret } }

            await expect(
                service.checkSubmission([lenient], context({ security: { 'recaptcha-token': 'token-123' } })),
            ).resolves.toBe(SecurityCheckResult.PASSED)
        })

        it('bounds the verification request with a timeout signal', async () => {
            mockVerification({ success: true, score: 0.9 })

            await service.checkSubmission([recaptcha], context({ security: { 'recaptcha-token': 'token-123' } }))

            const [, init] = fetchSpy.mock.calls[0]!
            expect(init?.method).toBe('POST')
            expect(init?.signal).toBeInstanceOf(AbortSignal)
        })

        it('verifies every configured captcha scheme and fails if any fails', async () => {
            const second = { ...recaptcha, key: 'second-token' }
            fetchSpy
                .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, score: 0.9 }), { status: 200 }))
                .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 200 }))

            await expect(
                service.checkSubmission(
                    [recaptcha, second],
                    context({ security: { 'recaptcha-token': 'one', 'second-token': 'two' } }),
                ),
            ).rejects.toThrow(new ForbiddenException('Captcha verification failed'))
            expect(fetchSpy).toHaveBeenCalledTimes(2)
        })
    })

    it('rejects unsupported scheme types', async () => {
        const csrf = scheme(InboundFormSecurityType.CSRF, InboundFormSecurityLocation.HEADER, 'x-csrf')

        await expect(service.checkSubmission([csrf], context())).rejects.toThrow(ForbiddenException)
    })

    it('passes a form without any security schemes', async () => {
        await expect(service.checkSubmission([], context())).resolves.toBe(SecurityCheckResult.PASSED)
    })
})
