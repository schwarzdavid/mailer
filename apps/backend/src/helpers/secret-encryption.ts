import { createCipheriv, createDecipheriv, randomBytes, scrypt, type CipherCCMTypes } from 'node:crypto'

const ALGORITHM: CipherCCMTypes = 'aes-256-ccm'
const VERSION = 'v1'
const SEPARATOR = '.'
const SALT_LENGTH = 16
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32

function deriveKey(masterSecret: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(masterSecret, salt, KEY_LENGTH, (error, key) => {
            if (error) {
                return reject(error)
            }
            resolve(key)
        })
    })
}

export async function encryptSecret(plaintext: string, masterSecret: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH)
    const iv = randomBytes(IV_LENGTH)
    const key = await deriveKey(masterSecret, salt)

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return [VERSION, ...[salt, iv, authTag, ciphertext].map((part) => part.toString('base64'))].join(SEPARATOR)
}

export async function decryptSecret(encrypted: string, masterSecret: string): Promise<string> {
    const [version, saltBase64, ivBase64, authTagBase64, ciphertextBase64] = encrypted.split(SEPARATOR)

    if (version !== VERSION) {
        throw new Error('Unsupported secret encryption version')
    }

    if (!saltBase64 || !ivBase64 || !authTagBase64 || !ciphertextBase64) {
        throw new Error('Malformed encrypted secret')
    }

    const authTag = Buffer.from(authTagBase64, 'base64')
    const key = await deriveKey(masterSecret, Buffer.from(saltBase64, 'base64'))

    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivBase64, 'base64'), {
        authTagLength: authTag.length,
    })
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(Buffer.from(ciphertextBase64, 'base64')), decipher.final()]).toString('utf8')
}
