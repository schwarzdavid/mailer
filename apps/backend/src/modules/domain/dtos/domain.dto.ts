import { Domain } from '../interfaces/domain.interface.js'
import { DomainDnsDto } from './domain-dns.dto.js'
import { Expose } from 'class-transformer'

export class DomainDto implements Omit<Domain, 'activeDkimId' | 'dnsRecords'> {
    @Expose()
    domainId!: number

    @Expose()
    fqdn!: string

    @Expose()
    rootDomain!: string

    @Expose()
    dns!: DomainDnsDto

    @Expose()
    lastCheckedAt: Date | null = null
}
