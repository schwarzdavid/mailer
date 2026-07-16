import { DomainDnsRecord, DomainDnsRecordUse } from '../interfaces/domain-dns.interface'
import { DomainDnsRecordDto } from './domain-dns-record.dto'
import { Expose, plainToInstance } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

type CustomerDnsRecordUse = DomainDnsRecordUse.SPF | DomainDnsRecordUse.DKIM | DomainDnsRecordUse.DMARC

const CUSTOMER_DNS_RECORD_USES: readonly DomainDnsRecordUse[] = [
    DomainDnsRecordUse.SPF,
    DomainDnsRecordUse.DKIM,
    DomainDnsRecordUse.DMARC,
]

const isCustomerDnsRecordUse = (use: DomainDnsRecordUse): use is CustomerDnsRecordUse =>
    CUSTOMER_DNS_RECORD_USES.includes(use)

export class DomainDnsDto implements Record<CustomerDnsRecordUse, DomainDnsRecordDto> {
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
            if (isCustomerDnsRecordUse(record.use)) {
                dnsDto[record.use] = plainToInstance(DomainDnsRecordDto, record, {
                    excludeExtraneousValues: true,
                    exposeDefaultValues: true,
                })
            }
        })
        return dnsDto
    }
}
