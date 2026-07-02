export enum DomainDnsRecordType {
    TXT = 'txt',
}

export enum DomainDnsRecordUse {
    SPF = 'spf',
    DKIM = 'dkim',
    DMARC = 'dmarc',
}

export enum DomainDnsRecordStatus {
    VALID,
    INVALID,
}

export interface DomainDnsRecord {
    type: DomainDnsRecordType
    use: DomainDnsRecordUse
    status: DomainDnsRecordStatus
    host: string
    value: string
    current: string | null
}
