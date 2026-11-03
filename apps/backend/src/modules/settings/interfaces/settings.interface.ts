import { DomainDnsRecord } from '../../domain/interfaces/domain-dns.interface.js'

export interface Settings {
    settingId: number
    sendingDomainId: number | null
    serverIpv4: string
    serverIpv6: string | null
    setupFinishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export type SettingsCreate = Omit<Settings, 'settingId' | 'setupFinishedAt' | 'createdAt' | 'updatedAt'>

export interface SendingDomain {
    fqdn: string
    serverIpv4: string
    serverIpv6: string | null
    lastCheckedAt: Date | null
    records: DomainDnsRecord[]
}

export interface SendingDomainProposal {
    fqdn: string
    serverIpv4: string | null
    serverIpv6: string | null
}
