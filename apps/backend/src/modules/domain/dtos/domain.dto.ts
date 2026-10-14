import { Domain, DomainProject } from '../interfaces/domain.interface.js'
import { DomainDnsDto } from './domain-dns.dto.js'
import { Expose, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

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

export class DomainProjectDto implements DomainProject {
    @Expose()
    @ApiProperty({ type: Number })
    projectId!: number

    @Expose()
    @ApiProperty({ type: String })
    name!: string
}

export class DomainDetailDto extends DomainDto {
    @Expose()
    @Type(() => DomainProjectDto)
    @ApiProperty({ type: [DomainProjectDto] })
    projects!: DomainProjectDto[]
}
