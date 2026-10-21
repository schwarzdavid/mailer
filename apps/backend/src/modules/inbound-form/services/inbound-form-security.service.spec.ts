import { ForbiddenException, Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from 'vitest'
import {
    InboundFormSecurityService,
    SecurityCheckOutcome,
    SecurityCheckResult,
    SecurityRequestContext,
} from './inbound-form-security.service.js'
import { InboundFormTokenService } from './inbound-form-token.service.js'
import {
    InboundFormRecaptchaStoredConfig,
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
    InboundFormTimedTokenConfig,
} from '../interfaces/inbound-form-security.interface.js'
import { VerifiedFormToken } from '../interfaces/inbound-form-token.interface.js'
import { SecretEncryptionService } from '../../encryption/services/secret-encryption.service.js'

function scheme(
    type: InboundFormSecurityType,
    location: InboundFormSecurityLocation,
    key: string,
    config: InboundFormRecaptchaStoredConfig | InboundFormTimedTokenConfig | null = null,
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
    return { security: {}, headers: {}, query: {}, allowedHostnames: [], ip: '203.0.113.7', ...partial }
}

function expectUrlSearchParamsBody(body: BodyInit | null | undefined): URLSearchParams {
    if (!(body instanceof URLSearchParams)) {
        throw new Error('expected a URLSearchParams body')
    }
    return body
}

const encryptedSecret = 'v1.salt.iv.tag.ciphertext'

const passed: SecurityCheckOutcome = { result: SecurityCheckResult.PASSED, token: null }
const spam: SecurityCheckOutcome = { result: SecurityCheckResult.SPAM }

describe('InboundFormSecurityService', () => {
    let service: InboundFormSecurityService
    let fetchSpy: MockInstance<typeof fetch>
    let decrypt: Mock<SecretEncryptionService['decrypt']>
    let errorSpy: MockInstance<Logger['error']>
    let verify: Mock<InboundFormTokenService['verify']>

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        decrypt = vi.fn<SecretEncryptionService['decrypt']>().mockResolvedValue('secret-key')
        verify = vi.fn<InboundFormTokenService['verify']>()

        const module = await Test.createTestingModule({
            providers: [
                InboundFormSecurityService,
                { provide: SecretEncryptionService, useValue: { decrypt } },
                { provide: InboundFormTokenService, useValue: { verify } },
            ],
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
            await expect(
                service.checkSubmission([honeypot], context({ security: { website: null } })),
            ).resolves.toEqual(passed)
        })

        it('flags spam when the honeypot is filled', async () => {
            await expect(
                service.checkSubmission([honeypot], context({ security: { website: 'http://spam.example' } })),
            ).resolves.toEqual(spam)
        })

        it('reads the honeypot from a header when configured', async () => {
            const headerHoneypot = { ...honeypot, location: InboundFormSecurityLocation.HEADER, key: 'X-Website' }

            await expect(
                service.checkSubmission([headerHoneypot], context({ headers: { 'x-website': 'spam' } })),
            ).resolves.toEqual(spam)
        })

        it('reads the honeypot from the query when configured', async () => {
            const queryHoneypot = { ...honeypot, location: InboundFormSecurityLocation.QUERY, key: 'website' }

            await expect(
                service.checkSubmission([queryHoneypot], context({ query: { website: 'spam' } })),
            ).resolves.toEqual(spam)
        })

        it('passes when the honeypot is an empty string', async () => {
            await expect(service.checkSubmission([honeypot], context({ security: { website: '' } }))).resolves.toEqual(
                passed,
            )
        })

        it('flags spam for any non-empty honeypot value, not only strings', async () => {
            await expect(service.checkSubmission([honeypot], context({ security: { website: 0 } }))).resolves.toEqual(
                spam,
            )
            await expect(
                service.checkSubmission([honeypot], context({ security: { website: false } })),
            ).resolves.toEqual(spam)
        })

        it('ignores honeypot values sent in a different location', async () => {
            await expect(
                service.checkSubmission(
                    [honeypot],
                    context({ headers: { website: 'spam' }, query: { website: 'spam' } }),
                ),
            ).resolves.toEqual(passed)
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
            ).resolves.toEqual(spam)
            expect(fetchSpy).not.toHaveBeenCalled()
        })
    })

    describe('origin', () => {
        const honeypot = scheme(InboundFormSecurityType.HONEYPOT, InboundFormSecurityLocation.BODY, 'website')

        it('rejects a foreign origin before the honeypot', async () => {
            await expect(
                service.checkSubmission(
                    [honeypot],
                    context({
                        security: { website: 'spam' },
                        allowedHostnames: ['kunde.at'],
                        headers: { origin: 'https://evil.at' },
                    }),
                ),
            ).rejects.toThrow(new ForbiddenException('Origin not allowed'))
        })

        it('rejects a missing origin when a list is set', async () => {
            await expect(service.checkSubmission([], context({ allowedHostnames: ['kunde.at'] }))).rejects.toThrow(
                new ForbiddenException('Origin not allowed'),
            )
        })

        it('passes a listed origin', async () => {
            await expect(
                service.checkSubmission(
                    [],
                    context({ allowedHostnames: ['kunde.at'], headers: { origin: 'https://Kunde.at:8443' } }),
                ),
            ).resolves.toEqual(passed)
        })
    })

    describe('recaptcha', () => {
        const recaptcha = scheme(
            InboundFormSecurityType.RECAPTCHA,
            InboundFormSecurityLocation.BODY,
            'recaptcha-token',
            { encryptedSecret, minScore: 0.5 },
        )

        function mockVerification(payload: { success: boolean; score?: number; hostname?: string; action?: string }) {
            fetchSpy.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
        }

        it('passes a successful verification with a sufficient score', async () => {
            mockVerification({ success: true, score: 0.9 })

            const result = await service.checkSubmission(
                [recaptcha],
                context({ security: { 'recaptcha-token': 'token-123' } }),
            )

            expect(result).toEqual(passed)
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

        const listed = (hostnames: string[]) =>
            context({
                security: { 'recaptcha-token': 'token-123' },
                allowedHostnames: hostnames,
                headers: { origin: 'https://kunde.at' },
            })

        const actionScheme = scheme(
            InboundFormSecurityType.RECAPTCHA,
            InboundFormSecurityLocation.BODY,
            'recaptcha-token',
            { encryptedSecret, expectedAction: 'contact' },
        )

        it('rejects a recaptcha hostname outside the list', async () => {
            mockVerification({ success: true, score: 0.9, hostname: 'evil.at' })

            await expect(service.checkSubmission([recaptcha], listed(['kunde.at']))).rejects.toThrow(
                new ForbiddenException('Captcha hostname mismatch'),
            )
        })

        it('accepts a recaptcha hostname inside the list', async () => {
            mockVerification({ success: true, score: 0.9, hostname: 'Kunde.at' })

            await expect(service.checkSubmission([recaptcha], listed(['kunde.at']))).resolves.toEqual(passed)
        })

        it('rejects a non-string recaptcha hostname when a list is set', async () => {
            fetchSpy.mockResolvedValue(
                new Response(JSON.stringify({ success: true, score: 0.9, hostname: 42 }), { status: 200 }),
            )

            await expect(service.checkSubmission([recaptcha], listed(['kunde.at']))).rejects.toThrow(
                new ForbiddenException('Captcha hostname mismatch'),
            )
        })

        it('rejects a missing recaptcha hostname when a list is set', async () => {
            mockVerification({ success: true, score: 0.9 })

            await expect(service.checkSubmission([recaptcha], listed(['kunde.at']))).rejects.toThrow(
                new ForbiddenException('Captcha hostname mismatch'),
            )
        })

        it('skips the hostname check when the list is empty', async () => {
            mockVerification({ success: true, score: 0.9, hostname: 'evil.at' })

            await expect(service.checkSubmission([recaptcha], listed([]))).resolves.toEqual(passed)
        })

        it('rejects a mismatched action', async () => {
            mockVerification({ success: true, score: 0.9, action: 'login' })

            await expect(service.checkSubmission([actionScheme], listed([]))).rejects.toThrow(
                new ForbiddenException('Captcha action mismatch'),
            )
        })

        it('accepts a matching action', async () => {
            mockVerification({ success: true, score: 0.9, action: 'contact' })

            await expect(service.checkSubmission([actionScheme], listed([]))).resolves.toEqual(passed)
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

            expect(result).toEqual(passed)
        })

        it('reads the token from the query when configured', async () => {
            mockVerification({ success: true, score: 0.9 })
            const queryScheme = { ...recaptcha, location: InboundFormSecurityLocation.QUERY, key: 'captcha' }

            const result = await service.checkSubmission([queryScheme], context({ query: { captcha: 'query-token' } }))

            expect(result).toEqual(passed)
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
            ).resolves.toEqual(passed)
        })

        it('ignores the score when no minimum is configured', async () => {
            mockVerification({ success: true, score: 0 })
            const lenient = { ...recaptcha, config: { encryptedSecret } }

            await expect(
                service.checkSubmission([lenient], context({ security: { 'recaptcha-token': 'token-123' } })),
            ).resolves.toEqual(passed)
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

    describe('timed token', () => {
        const config: InboundFormTimedTokenConfig = { minDelaySeconds: 3, maxAgeSeconds: 3600 }
        const timedToken = scheme(
            InboundFormSecurityType.TIMED_TOKEN,
            InboundFormSecurityLocation.BODY,
            'formToken',
            config,
        )
        const verified: VerifiedFormToken = { nonce: 'nonce-1', maxAgeSeconds: 3600 }
        const honeypot = scheme(InboundFormSecurityType.HONEYPOT, InboundFormSecurityLocation.BODY, 'website')
        const recaptcha = scheme(InboundFormSecurityType.RECAPTCHA, InboundFormSecurityLocation.BODY, 'captcha', {
            encryptedSecret,
        })

        it.each<[InboundFormSecurityLocation, string, Partial<SecurityRequestContext>]>([
            [InboundFormSecurityLocation.BODY, 'formToken', { security: { formToken: 'signed-token' } }],
            [InboundFormSecurityLocation.HEADER, 'X-Form-Token', { headers: { 'x-form-token': 'signed-token' } }],
            [InboundFormSecurityLocation.QUERY, 'formToken', { query: { formToken: 'signed-token' } }],
        ])('verifies the timed token from its location (%s)', async (location, key, partial) => {
            verify.mockReturnValue(verified)

            const outcome = await service.checkSubmission([{ ...timedToken, location, key }], context(partial))

            expect(outcome).toEqual({ result: SecurityCheckResult.PASSED, token: verified })
            expect(verify).toHaveBeenCalledWith('signed-token', 1, '203.0.113.7', config)
        })

        it('skips recaptcha when the token is invalid', async () => {
            verify.mockImplementation(() => {
                throw new ForbiddenException('Invalid form token')
            })

            await expect(
                service.checkSubmission(
                    [recaptcha, timedToken],
                    context({ security: { captcha: 'captcha-token', formToken: 'forged' } }),
                ),
            ).rejects.toThrow(new ForbiddenException('Invalid form token'))
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('flags spam before verifying the token', async () => {
            await expect(
                service.checkSubmission([timedToken, honeypot], context({ security: { website: 'spam' } })),
            ).resolves.toEqual(spam)
            expect(verify).not.toHaveBeenCalled()
        })

        it('rejects a timed token scheme without a timing config', async () => {
            await expect(
                service.checkSubmission(
                    [{ ...timedToken, config: null }],
                    context({ security: { formToken: 'signed-token' } }),
                ),
            ).rejects.toThrow(new ForbiddenException('Form token is not configured'))
            expect(verify).not.toHaveBeenCalled()
        })

        it('carries the verified token alongside a passed recaptcha', async () => {
            verify.mockReturnValue(verified)
            fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))

            await expect(
                service.checkSubmission(
                    [timedToken, recaptcha],
                    context({ security: { captcha: 'captcha-token', formToken: 'signed-token' } }),
                ),
            ).resolves.toEqual({ result: SecurityCheckResult.PASSED, token: verified })
        })
    })

    it('passes a form without any security schemes', async () => {
        await expect(service.checkSubmission([], context())).resolves.toEqual(passed)
    })
})
