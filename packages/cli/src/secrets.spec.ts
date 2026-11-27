import { describe, expect, it } from 'vitest'
import { generateSecret, secretFingerprint, typedSecretProblem } from './secrets.ts'

describe('secrets', () => {
    it('generates 64 base64 characters', () => {
        expect(generateSecret()).toMatch(/^[A-Za-z0-9+/]{64}$/)
        expect(generateSecret()).not.toBe(generateSecret())
    })

    it('requires 32 characters for the backend secrets and 16 for the others', () => {
        expect(typedSecretProblem('BACKEND_JWT_SECRET', 'a'.repeat(31))).toBeDefined()
        expect(typedSecretProblem('BACKEND_JWT_SECRET', 'a'.repeat(32))).toBeUndefined()
        expect(typedSecretProblem('BACKEND_ENCRYPTION_SECRET', 'a'.repeat(31))).toBeDefined()
        expect(typedSecretProblem('DB_PASSWORD', 'a'.repeat(15))).toBeDefined()
        expect(typedSecretProblem('MAIL_PASSWORD', 'a'.repeat(16))).toBeUndefined()
    })

    it.each(['$', '#', ' ', '"', "'", '\\'])('refuses %j in a typed secret', (character) => {
        expect(typedSecretProblem('DB_PASSWORD', `${'a'.repeat(40)}${character}`)).toBeDefined()
    })

    it('fingerprints a secret without revealing it', () => {
        const fingerprint = secretFingerprint('a'.repeat(32))
        expect(fingerprint).toMatch(/^[0-9a-f]{16}$/)
        expect(secretFingerprint('a'.repeat(32))).toBe(fingerprint)
        expect(secretFingerprint('b'.repeat(32))).not.toBe(fingerprint)
    })
})
