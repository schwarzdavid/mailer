import { DomainDnsRecord } from '../../domain/interfaces/domain-dns.interface.js'

export interface Settings {
    settingId: number
    sendingDomainId: number | null
    setupFinishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export type SettingsCreate = Pick<Settings, 'sendingDomainId'>

export interface SendingDomain {
    fqdn: string
    serverIpv4: string
    serverIpv6: string | null
    lastCheckedAt: Date | null
    records: DomainDnsRecord[]
}
