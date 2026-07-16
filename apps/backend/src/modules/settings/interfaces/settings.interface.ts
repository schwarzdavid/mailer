import { DomainDnsRecord } from '../../domain/interfaces/domain-dns.interface'

export interface Settings {
    settingId: number
    sendingDomainId: number | null
    serverIpv4: string
    serverIpv6: string | null
    createdAt: Date
    updatedAt: Date
}

export type SettingsCreate = Omit<Settings, 'settingId' | 'createdAt' | 'updatedAt'>

export interface SendingDomain {
    fqdn: string
    serverIpv4: string
    serverIpv6: string | null
    lastCheckedAt: Date | null
    records: DomainDnsRecord[]
}

export interface SendingDomainConfigure {
    fqdn: string
    serverIpv4: string
    serverIpv6: string | null
}
