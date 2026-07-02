import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DkimEncryptionService } from './dkim-encryption.service'

describe('DkimEncryptionService', () => {
    let service: DkimEncryptionService
    let getOrThrow: ReturnType<typeof vi.fn>

    const secret = 'test-dkim-secret'
    // The contents are irrelevant to the cipher — it encrypts an opaque string —
    // so a representative PEM body keeps the test readable without a real key.
    const privateKeyPem = '-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkqh...\n-----END PRIVATE KEY-----\n'

    beforeEach(async () => {
        getOrThrow = vi.fn().mockReturnValue(secret)

        const module: TestingModule = await Test.createTestingModule({
            providers: [DkimEncryptionService, { provide: ConfigService, useValue: { getOrThrow } }],
        }).compile()

        service = module.get(DkimEncryptionService)
    })

    it('round-trips the private key back to the original plaintext', async () => {
        const encrypted = await service.encryptDkimPrivateKey(privateKeyPem)
        const decrypted = await service.decryptDkimPrivateKey(encrypted)

        expect(decrypted).toBe(privateKeyPem)
    })

    it('derives the encryption key from the configured secret', async () => {
        await service.encryptDkimPrivateKey(privateKeyPem)

        expect(getOrThrow).toHaveBeenCalledWith('BACKEND_DKIM_SECRET')
    })

    it('emits a versioned, dot-separated payload of salt, iv, auth tag and ciphertext', async () => {
        const encrypted = await service.encryptDkimPrivateKey(privateKeyPem)

        const parts = encrypted.split('.')
        expect(parts).toHaveLength(5)
        expect(parts[0]).toBe('v1')
        // The four cryptographic segments are all present and non-empty.
        for (const segment of parts.slice(1)) {
            expect(segment.length).toBeGreaterThan(0)
        }
    })

    it('produces different ciphertext each time thanks to a random salt and IV', async () => {
        const first = await service.encryptDkimPrivateKey(privateKeyPem)
        const second = await service.encryptDkimPrivateKey(privateKeyPem)

        expect(first).not.toBe(second)
        // Both distinct ciphertexts still decrypt back to the same plaintext.
        expect(await service.decryptDkimPrivateKey(first)).toBe(privateKeyPem)
        expect(await service.decryptDkimPrivateKey(second)).toBe(privateKeyPem)
    })

    it('rejects a payload written with an unknown version', async () => {
        const encrypted = await service.encryptDkimPrivateKey(privateKeyPem)
        const tampered = `v2${encrypted.slice(2)}`

        await expect(service.decryptDkimPrivateKey(tampered)).rejects.toThrow('Invalid DKIM encryption version')
    })

    it('rejects a payload that is missing cryptographic segments', async () => {
        await expect(service.decryptDkimPrivateKey('v1.only-a-salt')).rejects.toThrow('Invalid DKIM encryption data')
    })

    it('fails authentication when the ciphertext has been tampered with', async () => {
        const parts = (await service.encryptDkimPrivateKey(privateKeyPem)).split('.')
        const ciphertext = parts[4]!
        // Flip the first (never-padding) character of the ciphertext segment.
        parts[4] = (ciphertext[0] === 'A' ? 'B' : 'A') + ciphertext.slice(1)

        await expect(service.decryptDkimPrivateKey(parts.join('.'))).rejects.toThrow()
    })
})
