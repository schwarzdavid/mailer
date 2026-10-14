import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SecretEncryptionService } from './secret-encryption.service.js'
import { decryptSecret, encryptSecret } from '../../../helpers/secret-encryption.js'

describe('SecretEncryptionService', () => {
    let service: SecretEncryptionService
    let get: Mock<(key: string) => string>

    const masterSecret = 'test-encryption-secret'

    beforeEach(async () => {
        get = vi.fn<(key: string) => string>().mockReturnValue(masterSecret)

        const module: TestingModule = await Test.createTestingModule({
            providers: [SecretEncryptionService, { provide: ConfigService, useValue: { get } }],
        }).compile()

        service = module.get(SecretEncryptionService)
    })

    it('encrypts with the configured master secret', async () => {
        const encrypted = await service.encrypt('server-secret')

        expect(get).toHaveBeenCalledWith('BACKEND_ENCRYPTION_SECRET', { infer: true })
        await expect(decryptSecret(encrypted, masterSecret)).resolves.toBe('server-secret')
    })

    it('decrypts with the configured master secret', async () => {
        const encrypted = await encryptSecret('server-secret', masterSecret)

        await expect(service.decrypt(encrypted)).resolves.toBe('server-secret')
    })

    it('round-trips through encrypt and decrypt', async () => {
        await expect(service.decrypt(await service.encrypt('server-secret'))).resolves.toBe('server-secret')
    })
})
