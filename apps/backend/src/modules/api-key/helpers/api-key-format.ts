import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const KEY_PATTERN = /^(sdm_[0-9A-Za-z]{8})_[A-Za-z0-9_-]{43}$/
const PREFIX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const PREFIX_LENGTH = 8
const SECRET_BYTES = 32

export interface GeneratedApiKey {
    key: string
    prefix: string
    secretHash: string
}

export function generateApiKey(): GeneratedApiKey {
    const randomPart = Array.from({ length: PREFIX_LENGTH }, () => PREFIX_ALPHABET[randomInt(PREFIX_ALPHABET.length)])
    const prefix = `sdm_${randomPart.join('')}`
    const key = `${prefix}_${randomBytes(SECRET_BYTES).toString('base64url')}`

    return { key, prefix, secretHash: hashApiKey(key) }
}

export function parseApiKeyPrefix(key: string): string | null {
    return KEY_PATTERN.exec(key)?.[1] ?? null
}

export function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex')
}

export function matchesApiKeyHash(key: string, secretHash: string): boolean {
    const actual = Buffer.from(hashApiKey(key), 'hex')
    const expected = Buffer.from(secretHash, 'hex')

    return actual.length === expected.length && timingSafeEqual(actual, expected)
}
