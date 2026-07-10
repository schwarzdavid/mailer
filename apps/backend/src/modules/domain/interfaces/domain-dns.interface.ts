export enum DomainDnsRecordType {
    TXT = 'txt',
}

export enum DomainDnsRecordUse {
    SPF = 'spf',
    DKIM = 'dkim',
    DMARC = 'dmarc',
}

export enum DomainDnsRecordStatus {
    VALID = 'valid',
    INVALID = 'invalid',
}

export interface DomainDnsRecord {
    dnsId: number
    domainId: number
    type: DomainDnsRecordType
    use: DomainDnsRecordUse
    status: DomainDnsRecordStatus
    host: string
    value: string
    current: string | null
    updatedAt: Date
    createdAt: Date
}

export type DomainDnsRecordCreate = Omit<DomainDnsRecord, 'dnsId' | 'updatedAt' | 'createdAt'>
