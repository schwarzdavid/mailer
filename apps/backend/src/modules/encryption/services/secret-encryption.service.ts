import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { decryptSecret, encryptSecret } from '../../../helpers/secret-encryption.js'
import type { Env } from '../../../config/env.schema.js'

@Injectable()
export class SecretEncryptionService {
    constructor(private readonly configService: ConfigService<Env, true>) {}

    encrypt(plaintext: string): Promise<string> {
        return encryptSecret(plaintext, this.masterSecret())
    }

    decrypt(encrypted: string): Promise<string> {
        return decryptSecret(encrypted, this.masterSecret())
    }

    private masterSecret(): string {
        return this.configService.get('BACKEND_ENCRYPTION_SECRET', { infer: true })
    }
}
