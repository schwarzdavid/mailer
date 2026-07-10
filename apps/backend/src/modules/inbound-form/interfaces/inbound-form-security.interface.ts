export enum InboundFormSecurityType {
    RECAPTCHA = 'google-recaptcha',
    CSRF = 'csrf',
    HONEYPOT = 'honeypot'
}

export enum InboundFormSecurityLocation {
    HEADER = 'header',
    QUERY = 'query'
}

export interface InboundFormSecurity {
    inboundFormSecurityId: number
    inboundFormId: number
    type: InboundFormSecurityType
    location: InboundFormSecurityLocation
    key: string
    createdAt: Date
    updatedAt: Date
}

export type InboundFormSecurityCreate = Omit<InboundFormSecurity, 'inboundFormSecurityId'>
