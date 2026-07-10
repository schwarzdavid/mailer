export enum InboundFormSecurityType {
    RECAPTCHA = 'google-recaptcha',
    CSRF = 'csrf',
    HONEYPOT = 'honeypot',
}

export enum InboundFormSecurityLocation {
    BODY = 'body',
    HEADER = 'header',
    QUERY = 'query',
}

export interface InboundFormRecaptchaConfig {
    secret: string
    minScore?: number
}

export interface InboundFormSecurity {
    inboundFormSecurityId: number
    inboundFormId: number
    type: InboundFormSecurityType
    location: InboundFormSecurityLocation
    key: string
    config: InboundFormRecaptchaConfig | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormSecurityCreate = Omit<InboundFormSecurity, 'inboundFormSecurityId' | 'createdAt' | 'updatedAt'>

export type InboundFormSecurityUpsert = Omit<InboundFormSecurityCreate, 'inboundFormId'>
