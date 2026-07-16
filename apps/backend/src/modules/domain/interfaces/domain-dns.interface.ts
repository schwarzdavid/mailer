export enum DomainDnsRecordType {
    TXT = 'txt',
    A = 'a',
    AAAA = 'aaaa',
    MX = 'mx',
    PTR = 'ptr',
}

export enum DomainDnsRecordUse {
    SPF = 'spf',
    DKIM = 'dkim',
    DMARC = 'dmarc',
    A = 'a',
    AAAA = 'aaaa',
    MX = 'mx',
    PTR = 'ptr',
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
