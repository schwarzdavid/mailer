export interface IssuedFormToken {
    token: string
    notBefore: Date
    expiresAt: Date
    waitMs: number
}

export interface VerifiedFormToken {
    nonce: string
    maxAgeSeconds: number
}

export interface FormTokenClock {
    now(): number
}
