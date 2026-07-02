import { DomainDnsRecord, DomainDnsRecordUse } from '../interfaces/domain-dns.interface'
import { DomainDnsRecordDto } from './domain-dns-record.dto'
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

export class DomainDnsDto implements Record<DomainDnsRecordUse, DomainDnsRecord>{
    @Expose()
    @ApiProperty({name: DomainDnsRecordUse.SPF})
    [DomainDnsRecordUse.SPF]!: DomainDnsRecordDto

    @Expose()
    @ApiProperty({name: DomainDnsRecordUse.DKIM})
    [DomainDnsRecordUse.DKIM]!: DomainDnsRecordDto

    @Expose()
    @ApiProperty({name: DomainDnsRecordUse.DMARC})
    [DomainDnsRecordUse.DMARC]!: DomainDnsRecordDto
}
