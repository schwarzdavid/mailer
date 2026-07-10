import { DomainDnsRecord, DomainDnsRecordUse } from '../interfaces/domain-dns.interface'
import { DomainDnsRecordDto } from './domain-dns-record.dto'
import { Expose, plainToInstance } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

export class DomainDnsDto implements Record<DomainDnsRecordUse, DomainDnsRecordDto> {
    @Expose()
    @ApiProperty({ name: DomainDnsRecordUse.SPF })
    [DomainDnsRecordUse.SPF]!: DomainDnsRecordDto;

    @Expose()
    @ApiProperty({ name: DomainDnsRecordUse.DKIM })
    [DomainDnsRecordUse.DKIM]!: DomainDnsRecordDto;

    @Expose()
    @ApiProperty({ name: DomainDnsRecordUse.DMARC })
    [DomainDnsRecordUse.DMARC]!: DomainDnsRecordDto

    static fromArray(records: DomainDnsRecord[]): DomainDnsDto {
        const dnsDto = new DomainDnsDto()
        records.forEach((record) => {
            dnsDto[record.use] = plainToInstance(DomainDnsRecordDto, record, {
                excludeExtraneousValues: true,
                exposeDefaultValues: true,
            })
        })
        return dnsDto
    }
}
