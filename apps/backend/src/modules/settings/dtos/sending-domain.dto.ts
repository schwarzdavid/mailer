import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { SendingDomain } from '../interfaces/settings.interface'
import { DomainDnsRecordDto } from '../../domain/dtos/domain-dns-record.dto'

export class SendingDomainDto implements Omit<SendingDomain, 'records'> {
    @Expose()
    fqdn!: string

    @Expose()
    serverIpv4!: string

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    serverIpv6: string | null = null

    @Expose()
    @ApiProperty({ type: Date, nullable: true })
    lastCheckedAt: Date | null = null

    @Expose()
    @Type(() => DomainDnsRecordDto)
    @ApiProperty({ type: [DomainDnsRecordDto] })
    records: DomainDnsRecordDto[] = []
}
