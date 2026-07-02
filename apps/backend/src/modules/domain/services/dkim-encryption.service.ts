import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { scrypt, randomBytes, createCipheriv, CipherCCMTypes, createDecipheriv } from 'node:crypto'

@Injectable()
export class DkimEncryptionService {
    private static readonly ALGORITHM: CipherCCMTypes = 'aes-256-ccm'
    private static readonly VERSION = 'v1'
    private static readonly SEPARATOR = '.'

    constructor(private readonly configService: ConfigService) {}

    async encryptDkimPrivateKey(dkimPrivateKeyPem: string): Promise<string> {
        const salt = randomBytes(16)
        const iv = randomBytes(12)
        const key = await this.getEncryptionKey(salt)

        const cipher = createCipheriv(DkimEncryptionService.ALGORITHM, key, iv, {
            authTagLength: 16,
        })
        const encryptedDkimKey = Buffer.concat([cipher.update(dkimPrivateKeyPem, 'utf8'), cipher.final()])
        const authTag = cipher.getAuthTag()
        const parts: string[] = [
            DkimEncryptionService.VERSION,
            salt.toString('base64'),
            iv.toString('base64'),
            authTag.toString('base64'),
            encryptedDkimKey.toString('base64'),
        ]

        return parts.join(DkimEncryptionService.SEPARATOR)
    }

    async decryptDkimPrivateKey(encryptedPrivateKeyPem: string): Promise<string> {
        const [version, saltBase64, ivBase64, authTagBase64, encryptedDkimKeyBase64] = encryptedPrivateKeyPem.split(
            DkimEncryptionService.SEPARATOR,
        )

        if (version !== DkimEncryptionService.VERSION) {
            throw new Error('Invalid DKIM encryption version')
        }

        if (!saltBase64 || !ivBase64 || !authTagBase64 || !encryptedDkimKeyBase64) {
            throw new Error('Invalid DKIM encryption data')
        }

        const salt = Buffer.from(saltBase64, 'base64')
        const iv = Buffer.from(ivBase64, 'base64')
        const authTag = Buffer.from(authTagBase64, 'base64')
        const encryptedDkimKey = Buffer.from(encryptedDkimKeyBase64, 'base64')
        const key = await this.getEncryptionKey(salt)

        const decipher = createDecipheriv(DkimEncryptionService.ALGORITHM, key, iv, {
            authTagLength: authTag.length,
        })
        decipher.setAuthTag(authTag)

        const decryptedDkimKey = Buffer.concat([decipher.update(encryptedDkimKey), decipher.final()])

        return decryptedDkimKey.toString('utf8')
    }

    private async getEncryptionKey(salt: Buffer): Promise<Buffer> {
        const plainSecret = this.configService.getOrThrow<string>('BACKEND_DKIM_SECRET')

        return new Promise((resolve, reject) => {
            scrypt(plainSecret, salt, 32, (err, key) => {
                if (err) {
                    return reject(err)
                }
                resolve(key)
            })
        })
    }
}
