import { DomainDkim } from './domain-dkim.interface.js'
import { DomainDnsRecord } from './domain-dns.interface.js'

export interface Domain {
    domainId: number
    fqdn: string
    rootDomain: string
    activeDkimId: number
    dnsRecords: DomainDnsRecord[]
    lastCheckedAt: Date | null
}

export interface DomainProject {
    projectId: number
    name: string
}

export interface DomainWithProjects extends Domain {
    projects: DomainProject[]
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
