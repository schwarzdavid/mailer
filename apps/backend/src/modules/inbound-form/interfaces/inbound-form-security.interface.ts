export enum InboundFormSecurityType {
    RECAPTCHA = 'google-recaptcha',
    HONEYPOT = 'honeypot',
    TIMED_TOKEN = 'timed-token',
}

export enum InboundFormSecurityLocation {
    BODY = 'body',
    HEADER = 'header',
    QUERY = 'query',
}

export interface InboundFormRecaptchaStoredConfig {
    encryptedSecret: string
    minScore?: number
    expectedAction?: string
}

export interface InboundFormTimedTokenConfig {
    minDelaySeconds: number
    maxAgeSeconds: number
}

export type InboundFormSecurityStoredConfig = InboundFormRecaptchaStoredConfig | InboundFormTimedTokenConfig

export interface InboundFormSecurityConfigInput {
    secret?: string
    minScore?: number
    expectedAction?: string
    minDelaySeconds?: number
    maxAgeSeconds?: number
}

export interface InboundFormSecurity {
    inboundFormSecurityId: number
    inboundFormId: number
    type: InboundFormSecurityType
    location: InboundFormSecurityLocation
    key: string
    config: InboundFormSecurityStoredConfig | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormSecurityCreate = Omit<InboundFormSecurity, 'inboundFormSecurityId' | 'createdAt' | 'updatedAt'>

export type InboundFormSecurityUpsert = Omit<InboundFormSecurityCreate, 'inboundFormId' | 'config'> & {
    config: InboundFormSecurityConfigInput | null
}
