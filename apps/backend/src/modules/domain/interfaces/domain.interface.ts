import { DomainDkim } from './domain-dkim.interface'
import { DomainDnsRecord } from './domain-dns.interface'

export interface Domain {
    domainId: number
    fqdn: string
    rootDomain: string
    activeDkimId: number
    dnsRecords: DomainDnsRecord[]
    lastCheckedAt: Date | null
}

export interface DomainWithDkim extends Domain {
    activeDkim: DomainDkim
    dkims: DomainDkim[]
}

export interface DomainWithActiveDkim extends Domain {
    activeDkim: DomainDkim
}

export interface SendingDomainIps {
    serverIpv4: string
    serverIpv6: string | null
}
