import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptSecret, encryptSecret } from './secret-encryption.js'

const scryptControl = vi.hoisted(() => ({ fail: false }))

vi.mock('node:crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:crypto')>()
    return {
        ...actual,
        scrypt: (
            password: string,
            salt: Buffer,
            keylen: number,
            callback: (err: Error | null, derivedKey: Buffer) => void,
        ) =>
            scryptControl.fail
                ? callback(new Error('scrypt failed'), Buffer.alloc(0))
                : actual.scrypt(password, salt, keylen, callback),
    }
})

const masterSecret = 'test-master-secret'
const plaintext = '-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkqh...\n-----END PRIVATE KEY-----\n'

// Produced by the former DkimEncryptionService; existing DKIM keys in the database
// use this exact format and key derivation, so it must keep decrypting.
const legacyDkimCiphertext =
    'v1.rUl/QSO2ka4PIFMlRGOLHg==.R3NarLmGbI2knogb.ICdRnuIl/5N/cfB8iT44gg==.PXCmAAStTuGwi8+uxkXUESTrLeIae/owvAJKa0Dgb9JwYLStZ27K+HFFj1NPhQT4LNNVK5tgeA0m29QRYhlWcHDfo7jY'

function tamperSegment(encrypted: string, index: number): string {
    const parts = encrypted.split('.')
    const segment = parts[index]!
    parts[index] = (segment[0] === 'A' ? 'B' : 'A') + segment.slice(1)
    return parts.join('.')
}

describe('secret encryption', () => {
    afterEach(() => {
        scryptControl.fail = false
    })

    it('round-trips a secret back to the original plaintext', async () => {
        const encrypted = await encryptSecret(plaintext, masterSecret)

        expect(encrypted).not.toContain('PRIVATE KEY')
        await expect(decryptSecret(encrypted, masterSecret)).resolves.toBe(plaintext)
    })

    it('decrypts a DKIM key encrypted by the previous implementation', async () => {
        await expect(decryptSecret(legacyDkimCiphertext, 'legacy-dkim-secret')).resolves.toBe(
            '-----BEGIN PRIVATE KEY-----\nlegacy-fixture\n-----END PRIVATE KEY-----\n',
        )
    })

    it('emits a versioned, dot-separated payload of salt, iv, auth tag and ciphertext', async () => {
        const parts = (await encryptSecret(plaintext, masterSecret)).split('.')

        expect(parts).toHaveLength(5)
        expect(parts[0]).toBe('v1')
        expect(Buffer.from(parts[1]!, 'base64')).toHaveLength(16)
        expect(Buffer.from(parts[2]!, 'base64')).toHaveLength(12)
        expect(Buffer.from(parts[3]!, 'base64')).toHaveLength(16)
        expect(parts[4]!.length).toBeGreaterThan(0)
    })

    it('produces different ciphertext each time thanks to a random salt and IV', async () => {
        const first = await encryptSecret(plaintext, masterSecret)
        const second = await encryptSecret(plaintext, masterSecret)

        expect(first).not.toBe(second)
        await expect(decryptSecret(first, masterSecret)).resolves.toBe(plaintext)
        await expect(decryptSecret(second, masterSecret)).resolves.toBe(plaintext)
    })

    it('fails to decrypt with a different master secret', async () => {
        const encrypted = await encryptSecret(plaintext, masterSecret)

        await expect(decryptSecret(encrypted, 'another-master-secret')).rejects.toThrow()
    })

    it.each([
        ['ciphertext', 4],
        ['auth tag', 3],
    ])('fails authentication when the %s has been tampered with', async (_segment, index) => {
        const encrypted = await encryptSecret(plaintext, masterSecret)

        await expect(decryptSecret(tamperSegment(encrypted, index), masterSecret)).rejects.toThrow()
    })

    it('rejects a payload written with an unknown version', async () => {
        const encrypted = await encryptSecret(plaintext, masterSecret)

        await expect(decryptSecret(`v2${encrypted.slice(2)}`, masterSecret)).rejects.toThrow(
            'Unsupported secret encryption version',
        )
    })

    it('rejects plaintext that was never encrypted', async () => {
        await expect(decryptSecret('6LcPlainRecaptchaSecret', masterSecret)).rejects.toThrow(
            'Unsupported secret encryption version',
        )
    })

    it('rejects a payload that is missing cryptographic segments', async () => {
        await expect(decryptSecret('v1.only-a-salt', masterSecret)).rejects.toThrow('Malformed encrypted secret')
    })

    it('rejects when deriving the encryption key fails', async () => {
        scryptControl.fail = true

        await expect(encryptSecret(plaintext, masterSecret)).rejects.toThrow('scrypt failed')
    })
})
