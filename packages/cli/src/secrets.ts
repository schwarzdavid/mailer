import { createHmac, randomBytes } from 'node:crypto'

export const SECRET_KEYS = ['DB_PASSWORD', 'BACKEND_JWT_SECRET', 'BACKEND_ENCRYPTION_SECRET', 'MAIL_PASSWORD'] as const
export type SecretKey = (typeof SECRET_KEYS)[number]

const MINIMUM_LENGTH: Record<SecretKey, number> = {
    DB_PASSWORD: 16,
    BACKEND_JWT_SECRET: 32,
    BACKEND_ENCRYPTION_SECRET: 32,
    MAIL_PASSWORD: 16,
}

const ALLOWED_CHARACTERS = /^[A-Za-z0-9+/=_-]*$/
const FINGERPRINT_MESSAGE = 'mailer:encryption-secret:v1'

export function generateSecret(): string {
    return randomBytes(48).toString('base64')
}

export function typedSecretProblem(key: SecretKey, value: string): string | undefined {
    if (!ALLOWED_CHARACTERS.test(value)) {
        return `${key} may only contain letters, digits and + / = _ -`
    }
    const minimum = MINIMUM_LENGTH[key]
    if (value.length < minimum) {
        return `${key} must be at least ${minimum} characters`
    }
    return undefined
}

export function secretFingerprint(secret: string): string {
    return createHmac('sha256', secret).update(FINGERPRINT_MESSAGE).digest('hex').slice(0, 16)
}
