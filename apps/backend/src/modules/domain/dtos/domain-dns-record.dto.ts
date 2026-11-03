import {
    DomainDnsRecord,
    DomainDnsRecordIssue,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface.js'
import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

export class DomainDnsRecordDto implements Omit<DomainDnsRecord, 'dnsId' | 'domainId' | 'createdAt' | 'updatedAt'> {
    @Expose()
    current!: string | null

    @Expose()
    host!: string

    @Expose()
    @ApiProperty({ enum: [...Object.values(DomainDnsRecordIssue), null], nullable: true })
    issue!: DomainDnsRecordIssue | null

    @Expose()
    status!: DomainDnsRecordStatus

    @Expose()
    type!: DomainDnsRecordType

    @Expose()
    use!: DomainDnsRecordUse

    @Expose()
    value!: string
}
